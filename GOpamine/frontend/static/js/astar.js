//------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
    const API_BASE = 'http://localhost:5000/api';
    
    const VEHICLES = [
        { id: 1, name: "Xe máy", speed: 35, icon: "🏍️", type: "moto" },
        { id: 2, name: "Ô tô", speed: 45, icon: "🚗", type: "car" },
        { id: 3, name: "Xe buýt", speed: 30, icon: "🚌", type: "bus" }
    ];

    let PLACES = [];
    let selectedVehicle = VEHICLES[1];
    let map;
    let routeLine = null;
    let startMarker = null;
    let endMarker = null;

    function initMap() {
        map = L.map('astarMap').setView([10.7769, 106.6955], 13);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 19
        }).addTo(map);
    }

    async function loadPlaces() {
        try {
            console.log('🔄 Đang load địa điểm từ database...');
            const response = await fetch(`${API_BASE}/places`);
            const result = await response.json();
            
            if (result.success) {
                PLACES = result.data;
                console.log(`✅ Đã load ${PLACES.length} địa điểm`);
                
                PLACES.forEach(place => {
                    L.marker([place.lat, place.lon])
                        .bindPopup(
                            `<div class="popup-title">${place.name}</div>
                             <div class="popup-coords">${place.lat.toFixed(4)}, ${place.lon.toFixed(4)}</div>`
                        )
                        .addTo(map);
                });
                
                setupUI();
            } else {
                console.error('❌ Lỗi:', result.error);
                alert('Không thể load địa điểm từ server!');
            }
        } catch (error) {
            console.error('❌ Network error:', error);
            alert('Không thể kết nối server. Chạy: python app.py');
        }
    }

    function setupUI() {
        const startSelect = document.getElementById('startPlace');
        const endSelect = document.getElementById('endPlace');

        PLACES.forEach(place => {
            const option1 = document.createElement('option');
            option1.value = place.id;
            option1.textContent = place.name;
            startSelect.appendChild(option1);

            const option2 = document.createElement('option');
            option2.value = place.id;
            option2.textContent = place.name;
            endSelect.appendChild(option2);
        });

        const vehicleContainer = document.getElementById('vehicleOptions');
        VEHICLES.forEach(vehicle => {
            const btn = document.createElement('div');
            btn.className = 'vehicle-btn';
            if (vehicle.id === selectedVehicle.id) btn.classList.add('active');
            btn.innerHTML = `
                <div class="icon">${vehicle.icon}</div>
                <div class="name">${vehicle.name}</div>
                <div class="speed">${vehicle.speed} km/h</div>
            `;
            btn.onclick = () => {
                document.querySelectorAll('.vehicle-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                selectedVehicle = vehicle;
            };
            vehicleContainer.appendChild(btn);
        });
    }

    function displayRouteOnMap(coordinates, startPlace, endPlace) {
        if (routeLine) map.removeLayer(routeLine);
        if (startMarker) map.removeLayer(startMarker);
        if (endMarker) map.removeLayer(endMarker);

        const leafletCoords = coordinates.map(coord => [coord[1], coord[0]]);

        routeLine = L.polyline(leafletCoords, {
            color: '#667eea',
            weight: 5,
            opacity: 0.8,
            lineJoin: 'round'
        }).addTo(map);

        map.fitBounds(routeLine.getBounds(), { padding: [50, 50] });

        const startIcon = L.divIcon({
            html: '<div style="background: #4caf50; color: white; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 18px; border: 3px solid white; box-shadow: 0 3px 8px rgba(0,0,0,0.4);">A</div>',
            className: '',
            iconSize: [36, 36]
        });

        const endIcon = L.divIcon({
            html: '<div style="background: #f44336; color: white; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 18px; border: 3px solid white; box-shadow: 0 3px 8px rgba(0,0,0,0.4);">B</div>',
            className: '',
            iconSize: [36, 36]
        });

        startMarker = L.marker([startPlace.lat, startPlace.lon], { icon: startIcon })
            .bindPopup(`<strong>Điểm xuất phát</strong><br>${startPlace.name}`)
            .addTo(map);

        endMarker = L.marker([endPlace.lat, endPlace.lon], { icon: endIcon })
            .bindPopup(`<strong>Điểm đến</strong><br>${endPlace.name}`)
            .addTo(map);
    }

    document.getElementById('findRouteBtn').addEventListener('click', async () => {
        const startId = parseInt(document.getElementById('startPlace').value, 10);
        const endId = parseInt(document.getElementById('endPlace').value, 10);

        if (!startId || !endId) {
            alert('⚠️ Vui lòng chọn điểm đầu và điểm cuối!');
            return;
        }

        if (startId === endId) {
            alert('⚠️ Điểm đầu và điểm cuối không thể giống nhau!');
            return;
        }

        const resultBox = document.getElementById('resultBox');
        resultBox.style.display = 'block';
        resultBox.innerHTML = `
            <div style="text-align: center; padding: 30px;">
                <div style="font-size: 48px; margin-bottom: 10px;">🔄</div>
                <div style="font-size: 18px; color: #667eea;">Đang tính toán...</div>
                <div style="font-size: 14px; color: #999; margin-top: 10px;">A* + OSRM đang xử lý</div>
            </div>
        `;

        try {
            console.log('📡 Gọi API:', { start_id: startId, end_id: endId });
            
            const response = await fetch(`${API_BASE}/find-route`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    start_id: startId,
                    end_id: endId,
                    vehicle_speed: selectedVehicle.speed,
                    vehicle_type: selectedVehicle.type
                })
            });

            const result = await response.json();

            if (!result.success) {
                alert(`❌ Lỗi: ${result.error}`);
                resultBox.style.display = 'none';
                return;
            }

            const data = result.data;
            console.log('✅ Kết quả:', data);
            
            const startPlace = PLACES.find(p => p.id === startId);
            const endPlace = PLACES.find(p => p.id === endId);

            displayRouteOnMap(data.route_coordinates, startPlace, endPlace);

            resultBox.className = 'result-box';
            resultBox.innerHTML = `
                <h3>✅ Kết quả tìm đường</h3>
                <div class="result-stats">
                    <div class="stat-item">
                        <div class="stat-label">Khoảng cách</div>
                        <div class="stat-value">${data.distance_km} km</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-label">Thời gian</div>
                        <div class="stat-value">${data.duration_min} phút</div>
                    </div>
                </div>
                <div style="background: white; padding: 10px; border-radius: 6px; margin-bottom: 10px;">
                    <strong>Phương tiện:</strong> ${selectedVehicle.icon} ${selectedVehicle.name}
                </div>
                <div style="background: white; padding: 10px; border-radius: 6px; margin-bottom: 10px;">
                    <strong>OSRM profile:</strong> ${data.osrm_profile}
                </div>
                <div style="background: white; padding: 10px; border-radius: 6px; margin-bottom: 10px;">
                    <strong>Số điểm trung gian:</strong> ${data.total_waypoints - 2} điểm
                </div>
                <div class="route-list">
                    ${data.waypoints.map((p, i) => `
                        <div class="route-item ${i === 0 ? 'start' : i === data.waypoints.length - 1 ? 'end' : ''}">
                            <div class="route-number">${i + 1}</div>
                            <div>${p.name}</div>
                        </div>
                    `).join('')}
                </div>
            `;

        } catch (error) {
            console.error('❌ Error:', error);
            alert('❌ Không kết nối được server!\n\nKiểm tra:\n1. python app.py đang chạy\n2. http://localhost:5000');
            resultBox.style.display = 'none';
        }
    });

    document.getElementById('resetBtn').addEventListener('click', () => {
        document.getElementById('startPlace').value = '';
        document.getElementById('endPlace').value = '';
        document.getElementById('resultBox').style.display = 'none';

        if (routeLine) map.removeLayer(routeLine);
        if (startMarker) map.removeLayer(startMarker);
        if (endMarker) map.removeLayer(endMarker);

        routeLine = null;
        startMarker = null;
        endMarker = null;

        map.setView([10.7769, 106.6955], 13);
    });

    console.log('🚀 Khởi động ứng dụng...');
    initMap();
    loadPlaces();
});
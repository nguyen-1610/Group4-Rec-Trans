document.addEventListener('DOMContentLoaded', () => {
    const PLACES = [
        { id: 1, name: "Bến Thành Market", lat: 10.7727, lon: 106.6980 },
        { id: 2, name: "Nhà Thờ Đức Bà", lat: 10.7797, lon: 106.6991 },
        { id: 3, name: "Bưu Điện Trung Tâm", lat: 10.7798, lon: 106.6997 },
        { id: 4, name: "Dinh Độc Lập", lat: 10.7769, lon: 106.6955 },
        { id: 5, name: "Chợ Bình Tây", lat: 10.7502, lon: 106.6392 },
        { id: 6, name: "Phố Đi Bộ Nguyễn Huệ", lat: 10.7743, lon: 106.7011 },
        { id: 7, name: "Bitexco Tower", lat: 10.7716, lon: 106.7039 },
        { id: 8, name: "Thảo Cầm Viên", lat: 10.7878, lon: 106.7057 },
        { id: 9, name: "Bảo Tàng Chứng Tích Chiến Tranh", lat: 10.7796, lon: 106.6919 },
        { id: 10, name: "Bến Nhà Rồng", lat: 10.7675, lon: 106.7073 },
        { id: 11, name: "Chợ Ân Đông", lat: 10.7535, lon: 106.6680 },
        { id: 12, name: "Chợ Tân Định", lat: 10.7889, lon: 106.6917 },
        { id: 13, name: "Làng Du Lịch Bình Quới", lat: 10.8042, lon: 106.7429 },
        { id: 14, name: "Công Viên Lê Văn Tám", lat: 10.7830, lon: 106.6872 },
        { id: 15, name: "Chợ Bà Chiểu", lat: 10.8119, lon: 106.6954 },
        { id: 16, name: "Vincom Center", lat: 10.7828, lon: 106.7005 },
        { id: 17, name: "Đầm Sen Park", lat: 10.7649, lon: 106.6376 },
        { id: 18, name: "Phố Tây Bùi Viện", lat: 10.7666, lon: 106.6925 },
        { id: 19, name: "TTTM Saigon Centre", lat: 10.7822, lon: 106.7016 },
        { id: 20, name: "Chùa Vĩnh Nghiêm", lat: 10.7995, lon: 106.6804 }
    ];

    const VEHICLES = [
        { id: 1, name: "Đi bộ", speed: 5, icon: "🚶" },
        { id: 2, name: "Xe máy", speed: 30, icon: "🏍️" },
        { id: 3, name: "Ô tô", speed: 40, icon: "🚗" }
    ];

    let selectedVehicle = VEHICLES[1];
    let map;
    let routeLine = null;

    function initMap() {
        map = L.map('astarMap').setView([10.7769, 106.6955], 13);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 19
        }).addTo(map);

        PLACES.forEach(place => {
            L.marker([place.lat, place.lon])
                .bindPopup(
                    `<div class="popup-title">${place.name}</div>
                     <div class="popup-coords">${place.lat.toFixed(4)}, ${place.lon.toFixed(4)}</div>`
                )
                .addTo(map);
        });
    }

    function haversine(lat1, lon1, lat2, lon2) {
        const R = 6371;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;

        const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) ** 2;

        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    function aStar(start, goal, nodes) {
        const openSet = new Set([start.id]);
        const cameFrom = new Map();
        const gScore = new Map();
        const fScore = new Map();

        nodes.forEach(node => {
            gScore.set(node.id, Infinity);
            fScore.set(node.id, Infinity);
        });

        gScore.set(start.id, 0);
        fScore.set(start.id, haversine(start.lat, start.lon, goal.lat, goal.lon));

        while (openSet.size > 0) {
            let current = null;
            let lowestF = Infinity;

            for (const nodeId of openSet) {
                if (fScore.get(nodeId) < lowestF) {
                    lowestF = fScore.get(nodeId);
                    current = nodes.find(n => n.id === nodeId);
                }
            }

            if (current.id === goal.id) {
                return reconstructPath(cameFrom, current, nodes);
            }

            openSet.delete(current.id);

            nodes.forEach(neighbor => {
                if (neighbor.id === current.id) return;

                const distance = haversine(current.lat, current.lon, neighbor.lat, neighbor.lon);
                const tentativeG = gScore.get(current.id) + distance;

                if (tentativeG < gScore.get(neighbor.id)) {
                    cameFrom.set(neighbor.id, current.id);
                    gScore.set(neighbor.id, tentativeG);
                    fScore.set(neighbor.id, tentativeG + haversine(neighbor.lat, neighbor.lon, goal.lat, goal.lon));
                    openSet.add(neighbor.id);
                }
            });
        }

        return null;
    }

    function reconstructPath(cameFrom, current, nodes) {
        const path = [current];
        while (cameFrom.has(current.id)) {
            const prevId = cameFrom.get(current.id);
            current = nodes.find(n => n.id === prevId);
            path.unshift(current);
        }
        return path;
    }

    function displayRouteOnMap(path) {
        if (routeLine) {
            map.removeLayer(routeLine);
        }

        const coordinates = path.map(p => [p.lat, p.lon]);
        routeLine = L.polyline(coordinates, {
            color: '#667eea',
            weight: 5,
            opacity: 0.7
        }).addTo(map);

        map.fitBounds(routeLine.getBounds(), { padding: [50, 50] });

        const startIcon = L.divIcon({
            html: '<div style="background: #4caf50; color: white; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 16px; border: 3px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.3);">A</div>',
            className: '',
            iconSize: [30, 30]
        });

        const endIcon = L.divIcon({
            html: '<div style="background: #f44336; color: white; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 16px; border: 3px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.3);">B</div>',
            className: '',
            iconSize: [30, 30]
        });

        L.marker([path[0].lat, path[0].lon], { icon: startIcon })
            .bindPopup(`<strong>Điểm xuất phát</strong><br>${path[0].name}`)
            .addTo(map);

        L.marker([path[path.length - 1].lat, path[path.length - 1].lon], { icon: endIcon })
            .bindPopup(`<strong>Điểm đến</strong><br>${path[path.length - 1].name}`)
            .addTo(map);
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

    document.getElementById('findRouteBtn').addEventListener('click', () => {
        const startId = parseInt(document.getElementById('startPlace').value, 10);
        const endId = parseInt(document.getElementById('endPlace').value, 10);

        if (!startId || !endId) {
            alert('Vui lòng chọn điểm đầu và điểm cuối!');
            return;
        }

        if (startId === endId) {
            alert('Điểm đầu và điểm cuối không thể giống nhau!');
            return;
        }

        const start = PLACES.find(p => p.id === startId);
        const end = PLACES.find(p => p.id === endId);

        const path = aStar(start, end, PLACES);

        if (!path) return;

        let totalDistance = 0;
        for (let i = 0; i < path.length - 1; i++) {
            totalDistance += haversine(path[i].lat, path[i].lon, path[i + 1].lat, path[i + 1].lon);
        }

        const totalTime = (totalDistance / selectedVehicle.speed) * 60;
        const resultBox = document.getElementById('resultBox');
        resultBox.style.display = 'block';
        resultBox.className = 'result-box';
        resultBox.innerHTML = `
            <h3>✅ Kết quả tìm đường</h3>
            <div class="result-stats">
                <div class="stat-item">
                    <div class="stat-label">Khoảng cách</div>
                    <div class="stat-value">${totalDistance.toFixed(2)} km</div>
                </div>
                <div class="stat-item">
                    <div class="stat-label">Thời gian</div>
                    <div class="stat-value">${totalTime.toFixed(0)} phút</div>
                </div>
            </div>
            <div style="background: white; padding: 10px; border-radius: 6px; margin-bottom: 10px;">
                <strong>Phương tiện:</strong> ${selectedVehicle.icon} ${selectedVehicle.name}
            </div>
            <div style="background: white; padding: 10px; border-radius: 6px;">
                <strong>Số điểm trung gian:</strong> ${path.length - 2} điểm
            </div>
            <div class="route-list">
                ${path.map((p, i) => `
                    <div class="route-item ${i === 0 ? 'start' : i === path.length - 1 ? 'end' : ''}">
                        <div class="route-number">${i + 1}</div>
                        <div>${p.name}</div>
                    </div>
                `).join('')}
            </div>
        `;

        displayRouteOnMap(path);
    });

    document.getElementById('resetBtn').addEventListener('click', () => {
        document.getElementById('startPlace').value = '';
        document.getElementById('endPlace').value = '';
        document.getElementById('resultBox').style.display = 'none';

        if (routeLine) {
            map.removeLayer(routeLine);
            routeLine = null;
        }

        map.setView([10.7769, 106.6955], 13);
    });

    initMap();
    setupUI();
});


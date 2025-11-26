/**
 * 🚌 GOPamine - Map & Transport Logic
 * ==========================================
 * - Tích hợp Search Box & GPS (Giống Form).
 * - Vẽ đường đi lên Map.
 * - Giữ nguyên logic tính giá & render card cũ.
 */

document.addEventListener('DOMContentLoaded', async function() {
    
    // =========================================================================
    // 1. KHỞI TẠO & BIẾN STATE
    // =========================================================================
    
    // Biến quản lý vẽ đường (để xóa đi vẽ lại)
    let routeLayerGroup = L.layerGroup();
    
    // State lưu tọa độ hiện tại (để tính toán lại)
    let currentStart = { lat: null, lon: null, name: '' };
    let currentEnd = { lat: null, lon: null, name: '' };

    // Cấu hình API
    const NOMINATIM_SEARCH = 'https://nominatim.openstreetmap.org/search';
    const NOMINATIM_REVERSE = 'https://nominatim.openstreetmap.org/reverse';
    let debounceTimer = null;

    const TRAFFIC_CONFIG = {
        rush_hours: [[7, 9], [16.5, 19]], 
        speeds: { motorbike: { rush: 25, normal: 35 }, car: { rush: 15, normal: 35 }, bus: { rush: 12, normal: 20 }, walk: { rush: 4, normal: 5 } }
    };

    // =========================================================================
    // 2. MAP INITIALIZATION
    // =========================================================================

    const map = L.map('map', { zoomControl: false, zoom: 13 });
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap', maxZoom: 19
    }).addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    
    // Thêm Group Layer vào map (Quan trọng để xóa đường cũ)
    routeLayerGroup.addTo(map);

    // =========================================================================
    // 3. LOAD DỮ LIỆU BAN ĐẦU
    // =========================================================================

    const storedRoute = getStoredRouteFromStorage();
    
    if (storedRoute) {
        // Cập nhật State từ Storage
        currentStart = { ...storedRoute.start_place, lon: storedRoute.start_place.lon || storedRoute.start_place.lng };
        currentEnd = { ...storedRoute.end_place, lon: storedRoute.end_place.lon || storedRoute.end_place.lng };
        const distanceKm = storedRoute.distance_km;

        // Điền vào ô Input (Nếu có trên HTML)
        const inputStart = document.getElementById('map-origin');
        const inputEnd = document.getElementById('map-destination');
        if(inputStart) inputStart.value = currentStart.name;
        if(inputEnd) inputEnd.value = currentEnd.name;

        // Vẽ & Tính toán
        drawRouteOnMap(storedRoute.route_coordinates, currentStart, currentEnd);
        updateAllVehicleCardsDefault();
        await fetchAndRenderTransportOptions(distanceKm);
        
        // Auto select card
        if (storedRoute.vehicle) {
            const card = document.querySelector(`.option-card[data-vehicle="${storedRoute.vehicle.type}"]`);
            if (card) card.click();
        }
    } else {
        // Fallback view
        map.setView([10.7769, 106.7009], 13);
    }

    // =========================================================================
    // 4. LOGIC SEARCH BOX & GPS (MỚI THÊM - GIỐNG FORM)
    // =========================================================================

    const originInput = document.getElementById('map-origin');
    const destInput = document.getElementById('map-destination');
    const suggestionsBox = document.getElementById('map-suggestions');

    // Cấu hình sự kiện cho từng ô input
    if (originInput && destInput && suggestionsBox) {
        
        // 1. XỬ LÝ CHO Ô ĐIỂM ĐI (START)
        setupSingleInput(originInput, 'start');

        // 2. XỬ LÝ CHO Ô ĐIỂM ĐẾN (END)
        setupSingleInput(destInput, 'end');

        // 3. SỰ KIỆN CLICK RA NGOÀI (GỘP CHUNG - FIX LỖI BIẾN MẤT)
        document.addEventListener('click', (e) => {
            const isClickInsideOrigin = originInput.contains(e.target);
            const isClickInsideDest = destInput.contains(e.target);
            const isClickInsideBox = suggestionsBox.contains(e.target);

            // Nếu click KHÔNG trúng ô nào và KHÔNG trúng menu -> Ẩn
            if (!isClickInsideOrigin && !isClickInsideDest && !isClickInsideBox) {
                suggestionsBox.classList.add('hidden');
            }
        });
    }

    function setupSingleInput(input, type) {
        // A. Khi bấm vào (Focus)
        input.addEventListener('focus', () => {
            // Nếu ô trống và là Điểm đi -> Hiện nút GPS
            if (input.value.trim() === '' && type === 'start') {
                showGpsOptionOnly(suggestionsBox, type, input);
            }
            // Nếu có chữ -> Tìm kiếm lại
            else if (input.value.trim() !== '') {
                const query = input.value.trim();
                // Gọi lại hàm tìm kiếm để hiện lại gợi ý cũ (nếu cần)
                // Hoặc đơn giản là không làm gì nếu muốn user gõ mới
            }
        });

        // B. Khi gõ phím (Input)
        input.addEventListener('input', (e) => {
            const query = e.target.value.trim();
            clearTimeout(debounceTimer);
            
            if (query.length === 0) {
                if (type === 'start') showGpsOptionOnly(suggestionsBox, type, input);
                else suggestionsBox.classList.add('hidden');
                return;
            }

            debounceTimer = setTimeout(async () => {
                const places = await searchNominatim(query);
                showSearchResults(suggestionsBox, places, type, input);
            }, 400);
        });
    }

    function showGpsOptionOnly(box, type, inputElement) {
        box.innerHTML = '';
        box.classList.remove('hidden');

        const div = document.createElement('div');
        div.className = 'suggestion-item gps-item';
        div.style.color = '#3C7363';
        div.style.fontWeight = '500';
        div.innerHTML = `<i class="fas fa-location-crosshairs"></i> <span>Sử dụng vị trí hiện tại</span>`;
        div.onclick = () => handleGpsSelectionAdvanced(type, box, inputElement);
        
        box.appendChild(div);
    }

    function handleGpsSelectionAdvanced(type, box, inputElement) {
        if (!navigator.geolocation) { alert("Trình duyệt không hỗ trợ"); return; }
        
        inputElement.placeholder = "Đang định vị...";
        inputElement.value = "";
        box.classList.add('hidden');

        navigator.geolocation.getCurrentPosition(
            async (pos) => {
                const lat = pos.coords.latitude;
                const lon = pos.coords.longitude;
                
                inputElement.value = "📍 Đang tìm địa chỉ...";

                try {
                    const url = `${NOMINATIM_REVERSE_API}?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`;
                    const res = await fetch(url);
                    const data = await res.json();

                    const addr = data.address;
                    let displayName = "";
                    const road = addr.road || addr.pedestrian || addr.street || "";
                    const number = addr.house_number || "";
                    const district = addr.city_district || addr.district || addr.suburb || "";

                    if (road) {
                        displayName = number ? `${number} ${road}` : road;
                        if (district) displayName += `, ${district}`;
                    } else {
                        displayName = data.display_name.split(',').slice(0, 3).join(',');
                    }
                    
                    const finalName = `📍 ${displayName}`;
                    inputElement.value = finalName;
                    updateRouteState(type, { lat, lon, name: finalName });

                } catch (err) {
                    const backupName = `📍 Vị trí của tôi (${lat.toFixed(4)}, ${lon.toFixed(4)})`;
                    inputElement.value = backupName;
                    updateRouteState(type, { lat, lon, name: backupName });
                }
            }, 
            (err) => {
                alert("Lỗi lấy vị trí: " + err.message);
                inputElement.placeholder = "Nhập điểm đến...";
            }
        );
    }

    async function searchNominatim(query) {
        try {
            const url = `${NOMINATIM_SEARCH_API}?q=${encodeURIComponent(query)}&format=json&limit=5&viewbox=102.1,8.5,109.4,23.3&bounded=1&addressdetails=1`;
            const res = await fetch(url);
            return await res.json();
        } catch (e) { return []; }
    }

    function showSearchResults(box, places, type, inputElement) {
        box.innerHTML = '';
        box.classList.remove('hidden');

        // Chỉ hiện nút GPS cho ô Điểm đi
        if (type === 'start') {
            const gpsDiv = document.createElement('div');
            gpsDiv.className = 'suggestion-item gps-item';
            gpsDiv.innerHTML = `<i class="fas fa-location-crosshairs" style="color:#3C7363"></i> <span style="color:#3C7363">Vị trí hiện tại</span>`;
            gpsDiv.onclick = () => handleGpsSelectionAdvanced(type, box, inputElement);
            box.appendChild(gpsDiv);
        }

        if (places.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'suggestion-item';
            empty.innerText = 'Không tìm thấy kết quả';
            box.appendChild(empty);
            return;
        }

        places.forEach(place => {
            const div = document.createElement('div');
            div.className = 'suggestion-item';
            const shortName = place.display_name.split(',').slice(0, 2).join(',');
            div.innerHTML = `<i class="fas fa-map-marker-alt"></i> <span>${shortName}</span>`;
            
            div.onclick = () => {
                inputElement.value = shortName;
                box.classList.add('hidden');
                updateRouteState(type, {
                    lat: parseFloat(place.lat),
                    lon: parseFloat(place.lon),
                    name: shortName
                });
            };
            box.appendChild(div);
        });
    }

    function updateRouteState(type, point) {
        if (type === 'start') currentStart = point;
        else currentEnd = point;

        if (currentStart.lat && currentEnd.lat) {
            recalculateRoute();
        }
    }

    // =========================================================================
    // 5. LOGIC VẼ LẠI ĐƯỜNG (BRIDGE: SEARCH -> BACKEND -> UI)
    // =========================================================================

    async function recalculateRoute() {
        console.log("🔄 Đang tính lại lộ trình mới...");
        updateAllVehicleCardsDefault(); // Reset card loading

        try {
            // Gọi API tìm đường (OSM Routing)
            const response = await fetch('/api/find-route-osm', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ start: currentStart, end: currentEnd, vehicle_type: 'car' })
            });

            const data = await response.json();
            if (data.success) {
                const routeData = data.data;
                
                // 1. Vẽ lại map
                drawRouteOnMap(routeData.route_coordinates, currentStart, currentEnd);
                
                // 2. Gọi hàm tính tiền CŨ của bạn
                await fetchAndRenderTransportOptions(routeData.distance_km);
                
                // 3. Cập nhật Storage
                const newStorage = {
                    start_place: currentStart, end_place: currentEnd,
                    route_coordinates: routeData.route_coordinates,
                    distance_km: routeData.distance_km, waypoints: [currentStart, currentEnd]
                };
                localStorage.setItem('selectedRoute', JSON.stringify(newStorage));
            } else {
                alert("Không tìm thấy đường đi!");
            }
        } catch (error) { console.error(error); }
    }

    // Hàm vẽ đường (Dùng LayerGroup để xóa cũ vẽ mới dễ dàng)
    function drawRouteOnMap(coords, start, end) {
        routeLayerGroup.clearLayers(); // Xóa sạch cũ

        // Marker A
        createCustomMarker(map, start.lat, start.lon, '#4285f4', 'A', start.name);
        // Marker B
        createCustomMarker(map, end.lat, end.lon, '#ea4335', 'B', end.name);

        // Đường đi
        if (coords && coords.length > 0) {
            const latlngs = coords.map(c => [c[1], c[0]]);
            // Vẽ viền trắng
            L.polyline(latlngs, { color: 'white', weight: 8 }).addTo(routeLayerGroup);
            // Vẽ đường xanh
            const mainLine = L.polyline(latlngs, { color: '#4285f4', weight: 5 }).addTo(routeLayerGroup);
            map.fitBounds(mainLine.getBounds(), { padding: [50, 50], paddingTopLeft: [50, 150] });
        }
    }

    // =========================================================================
    // 6. CORE FUNCTIONS (CODE GỐC CỦA BẠN - GIỮ NGUYÊN)
    // =========================================================================

    async function fetchAndRenderTransportOptions(distanceKm) {
        try {
            let priorities = ['saving', 'speed'];
            try {
                const formData = JSON.parse(localStorage.getItem('formData'));
                if (formData?.preferences) {
                    priorities = formData.preferences.map(p => 
                        p.toLowerCase().includes('tiết') ? 'saving' :
                        p.toLowerCase().includes('nhanh') ? 'speed' :
                        p.toLowerCase().includes('an') ? 'safety' : 'comfort'
                    );
                }
            } catch (e) { console.warn("⚠️ Dùng priority mặc định."); }

            console.log(`📡 [API] Gọi compare-transport...`);

            const response = await fetch('/api/compare-transport', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    distance_km: distanceKm,
                    priorities: priorities,
                    is_student: false 
                })
            });

            const result = await response.json();
            
            if (result.success && result.data) {
                console.log("✅ [API] Dữ liệu nhận được:", result.data);
                renderDynamicCards(result.data, distanceKm);
            } else {
                console.error("❌ [API] Lỗi hoặc không có dữ liệu:", result);
            }
        } catch (error) {
            console.error("❌ [API] Lỗi kết nối:", error);
        }
    }

    function renderDynamicCards(backendResults, distanceKm) {
        const container = document.querySelector('.vehicle-scroll-container');
        container.innerHTML = '';

        const getIcon = (name) => {
            const n = name.toLowerCase();
            const path = '/static/icons/';
            let imgName = 'car_default.png';
            if (n.includes('grab')) imgName = 'grab.png';
            else if (n.includes('be')) imgName = 'be.png';
            else if (n.includes('xanh')) imgName = 'xanhsm.png';
            else if (n.includes('buýt') || n.includes('bus')) imgName = 'bus.png';
            else if (n.includes('bộ') || n.includes('walk')) imgName = 'walk.png';
            else if (n.includes('máy') || n.includes('bike')) imgName = 'motorbike.png';
            return `<img src="${path}${imgName}" class="brand-logo-img" alt="${name}">`;
        };

        backendResults.forEach(item => {
            const icon = getIcon(item.mode_name);
            const scoreColor = item.score >= 8.5 ? '#4caf50' : (item.score >= 6 ? '#ff9800' : '#f44336');
            const tagsHtml = item.labels.map(l => 
                `<span style="font-size:10px; background:#e3f2fd; color:#1565c0; padding:2px 5px; border-radius:3px; margin-right:3px;">${l}</span>`
            ).join('');

            const cardHtml = `
                <div class="option-card" 
                     data-vehicle="${item.mode_name}" 
                     data-price="${item.display_price}" 
                     data-time="${item.duration} phút"
                     data-score="${item.score}">
                    <div class="option-left">
                        <div class="vehicle-icon" style="font-size: 20px;">${icon}</div>
                        <div class="vehicle-info">
                            <h4>${item.mode_name}</h4>
                            <p>
                                <span style="font-weight:bold;">${item.duration} phút</span> • ${distanceKm.toFixed(1)} km
                                <br>
                                <div style="margin-top:2px;">${tagsHtml}</div>
                            </p>
                        </div>
                    </div>
                    <div class="option-right">
                        <div class="price" style="font-weight: bold; font-size: 14px;">${item.display_price}</div>
                        <div class="vehicle-score-new" style="color: ${scoreColor}; display: flex; align-items: center; justify-content: flex-end; gap: 4px; margin-top: 4px; font-size: 13px; font-weight: bold;">
                            <span style="color: #FFD700; font-size: 16px;">★</span> ${item.score}/10
                        </div>
                    </div>
                </div>
            `;
            container.insertAdjacentHTML('beforeend', cardHtml);
        });

        setupCardSelectionEvents();
        const firstCard = container.querySelector('.option-card');
        if(firstCard) firstCard.classList.add('selected');
    }

    function updateAllVehicleCardsDefault() {
        // Hàm này có thể giữ nguyên hoặc clear container để hiện loading spinner nếu muốn
        const container = document.querySelector('.vehicle-scroll-container');
        container.innerHTML = '<div style="text-align:center; padding:20px; color:#666;">Đang tính toán lộ trình và giá...</div>';
    }

    function createCustomMarker(map, lat, lng, color, label, popup) {
        const icon = L.divIcon({
            html: `<div style="background:${color}; color:white; width:30px; height:30px; border-radius:50%; display:flex; align-items:center; justify-content:center; border:2px solid white; box-shadow:0 2px 5px rgba(0,0,0,0.3); font-weight:bold;">${label}</div>`,
            className: '', iconSize: [30, 30], iconAnchor: [15, 15]
        });
        L.marker([lat, lng], { icon }).addTo(routeLayerGroup).bindPopup(popup); // Add vào Group thay vì Map
    }

    function setupCardSelectionEvents() {
        document.querySelectorAll('.option-card').forEach(card => {
            card.addEventListener('click', function() {
                document.querySelectorAll('.option-card').forEach(c => c.classList.remove('selected'));
                this.classList.add('selected');
            });
        });
    }

    function getStoredRouteFromStorage() {
        try { return JSON.parse(localStorage.getItem('selectedRoute')); } catch { return null; }
    }
});

// =============================================================================
// 6. GLOBAL FUNCTIONS (GIỮ NGUYÊN)
// =============================================================================

window.switchTab = function(arg1, arg2) {
    const tabName = (typeof arg1 === 'string') ? arg1 : arg2;
    if (tabName === 'ai' || tabName === 'chatbot') window.location.href = '/chatbot';
};

window.confirmRoute = function() {
    const card = document.querySelector('.option-card.selected');
    if (!card) return alert("Vui lòng chọn một phương tiện!");
    
    const choice = {
        type: card.dataset.vehicle,
        price: card.dataset.price,
        time: card.dataset.time,
        score: card.dataset.score
    };
    localStorage.setItem('finalChoice', JSON.stringify(choice));
    
    // Chỉ hiện thông báo giá tiền (Theo yêu cầu)
    alert(`💰 Giá dự kiến: ${choice.price}\n(Tính năng đặt xe đang phát triển)`);
};

window.goToPreviousPage = () => window.history.back();
window.goBack = () => window.location.href = '/chatbot';
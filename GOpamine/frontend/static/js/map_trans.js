/**
 * 🚌 GOPamine - Map & Transport Logic
 * ==========================================
 * - Yêu cầu: Phải load gopamine_utils.js trước file này.
 * - Chức năng: Tìm kiếm (dùng utils), Vẽ đường (OSM), Tính giá (Backend).
 */

document.addEventListener('DOMContentLoaded', async function() {
    
    // =========================================================================
    // 1. KHỞI TẠO & BIẾN STATE
    // =========================================================================
    
    // Biến quản lý vẽ đường (để xóa đi vẽ lại dễ dàng)
    let routeLayerGroup = L.layerGroup();
    
    // State lưu tọa độ hiện tại
    let currentStart = { lat: null, lon: null, name: '' };
    let currentEnd = { lat: null, lon: null, name: '' };

    // =========================================================================
    // 2. KHỞI TẠO BẢN ĐỒ (LEAFLET)
    // =========================================================================

    const map = L.map('map', { zoomControl: false, zoom: 13 });
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap', maxZoom: 19
    }).addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    
    routeLayerGroup.addTo(map); // Thêm layer vẽ đường vào map

    // =========================================================================
    // 3. LOAD DỮ LIỆU TỪ STORAGE (KHI TỪ FORM CHUYỂN QUA)
    // =========================================================================

    const storedRoute = getStoredRouteFromStorage();
    
    if (storedRoute) {
        // Cập nhật State
        currentStart = { ...storedRoute.start_place, lon: storedRoute.start_place.lon || storedRoute.start_place.lng };
        currentEnd = { ...storedRoute.end_place, lon: storedRoute.end_place.lon || storedRoute.end_place.lng };
        
        // Điền tên vào ô Input
        const inputStart = document.getElementById('map-origin');
        const inputEnd = document.getElementById('map-destination');
        if(inputStart) inputStart.value = currentStart.name;
        if(inputEnd) inputEnd.value = currentEnd.name;

        // Vẽ đường & Load danh sách xe
        drawRouteOnMap(storedRoute.route_coordinates, currentStart, currentEnd);
        updateAllVehicleCardsDefault();
        await fetchAndRenderTransportOptions(storedRoute.distance_km);
        
        // Tự động chọn thẻ xe đã chọn bên form (nếu có)
        if (storedRoute.vehicle) {
            const card = document.querySelector(`.option-card[data-vehicle="${storedRoute.vehicle.type}"]`);
            if (card) card.click();
        }
    } else {
        // Nếu không có dữ liệu, hiển thị mặc định (TP.HCM)
        map.setView([10.7769, 106.7009], 13);
    }

    // =========================================================================
    // 4. LOGIC TÌM KIẾM MỚI (SỬ DỤNG AUTOCOMPLETE TỪ UTILS)
    // =========================================================================

    /**
     * Callback: Hàm này chạy khi user chọn một địa điểm từ danh sách gợi ý
     */
    function handleMapInputUpdate(placeData, inputElement) {
        // 1. Chuẩn hóa dữ liệu
        const newPlace = {
            lat: parseFloat(placeData.lat),
            lon: parseFloat(placeData.lon),
            name: placeData.name.split(',').slice(0, 2).join(',') // Lấy tên ngắn gọn
        };
        
        // 2. Lưu vào dataset (để tiện debug hoặc sử dụng lại)
        inputElement.dataset.placeData = JSON.stringify(newPlace);

        // 3. Cập nhật biến State toàn cục
        if (inputElement.id === 'map-origin') {
            console.log("📍 Đã chọn điểm đi:", newPlace.name);
            currentStart = newPlace;
        } else if (inputElement.id === 'map-destination') {
            console.log("📍 Đã chọn điểm đến:", newPlace.name);
            currentEnd = newPlace;
        }
        
        // 4. Tự động tính lại lộ trình nếu đã đủ 2 điểm
        if (currentStart.lat && currentEnd.lat) {
            recalculateRoute();
        }
    }

    // Lấy phần tử input
    const originInput = document.getElementById('map-origin');
    const destInput = document.getElementById('map-destination');

    // Kích hoạt Autocomplete (Hàm này lấy từ gopamine_utils.js)
    if (typeof setupAutocomplete === 'function') {
        if (originInput) {
            setupAutocomplete(originInput, handleMapInputUpdate);
        }
        if (destInput) {
            setupAutocomplete(destInput, handleMapInputUpdate);
        }
    } else {
        console.error("⚠️ Chưa load file gopamine_utils.js!");
    }

    // =========================================================================
    // 5. LOGIC TÍNH TOÁN VÀ VẼ LỘ TRÌNH (GỌI API)
    // =========================================================================

    async function recalculateRoute() {
        console.log("🔄 Đang tính toán lại lộ trình...");
        
        // Hiện trạng thái loading ở danh sách xe
        updateAllVehicleCardsDefault(); 

        try {
            // Gọi API Backend (routing.py)
            const response = await fetch('/api/find-route-osm', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    start: currentStart, 
                    end: currentEnd, 
                    vehicle_type: 'car' 
                })
            });

            const result = await response.json();
            
            if (result.success) {
                const routeData = result.data;
                
                // 1. Vẽ lại đường lên Map
                drawRouteOnMap(routeData.route_coordinates, currentStart, currentEnd);
                
                // 2. Tính toán lại giá tiền các phương tiện
                await fetchAndRenderTransportOptions(routeData.distance_km);
                
                // 3. Cập nhật LocalStorage (để nếu reload trang vẫn còn)
                const newStorage = {
                    start_place: currentStart, 
                    end_place: currentEnd,
                    route_coordinates: routeData.route_coordinates,
                    distance_km: routeData.distance_km, 
                    waypoints: [currentStart, currentEnd]
                };
                localStorage.setItem('selectedRoute', JSON.stringify(newStorage));
                
            } else {
                alert("Không tìm thấy đường đi giữa 2 điểm này!");
            }
        } catch (error) { 
            console.error("Lỗi tính lộ trình:", error);
            alert("Có lỗi xảy ra khi tìm đường.");
        }
    }

    function drawRouteOnMap(coords, start, end) {
        routeLayerGroup.clearLayers(); // Xóa đường cũ

        // Marker Điểm đi (A)
        createCustomMarker(map, start.lat, start.lon, '#4285f4', 'A', start.name);
        // Marker Điểm đến (B)
        createCustomMarker(map, end.lat, end.lon, '#ea4335', 'B', end.name);

        // Vẽ đường nối
        if (coords && coords.length > 0) {
            // OSRM trả về [lon, lat] -> Leaflet cần [lat, lon]
            const latlngs = coords.map(c => [c[1], c[0]]);
            
            // Vẽ viền trắng (để nổi bật trên nền bản đồ)
            L.polyline(latlngs, { color: 'white', weight: 8 }).addTo(routeLayerGroup);
            // Vẽ đường chính màu xanh
            const mainLine = L.polyline(latlngs, { color: '#4285f4', weight: 5 }).addTo(routeLayerGroup);
            
            // Zoom map vừa khít với đường đi
            map.fitBounds(mainLine.getBounds(), { padding: [50, 50], paddingTopLeft: [50, 150] });
        }
    }

    // =========================================================================
    // 6. RENDER CARDS & UI (LOGIC CŨ GIỮ NGUYÊN)
    // =========================================================================

    async function fetchAndRenderTransportOptions(distanceKm) {
        try {
            // Lấy ưu tiên từ form cũ (nếu có)
            let priorities = ['saving', 'speed'];
            try {
                const formData = JSON.parse(localStorage.getItem('formData'));
                if (formData?.preferences) {
                    priorities = formData.preferences.map(p => 
                        p.toLowerCase().includes('tiết') ? 'saving' :
                        p.toLowerCase().includes('nhanh') ? 'speed' : 'comfort'
                    );
                }
            } catch (e) {}

            // Gọi API so sánh giá
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
                renderDynamicCards(result.data, distanceKm);
            }
        } catch (error) {
            console.error("Lỗi lấy giá xe:", error);
        }
    }

    function renderDynamicCards(backendResults, distanceKm) {
        const container = document.querySelector('.vehicle-scroll-container');
        container.innerHTML = '';

        // Hàm helper lấy icon
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
        
        // Auto select first card
        const firstCard = container.querySelector('.option-card');
        if(firstCard) firstCard.classList.add('selected');
    }

    function updateAllVehicleCardsDefault() {
        const container = document.querySelector('.vehicle-scroll-container');
        container.innerHTML = '<div style="text-align:center; padding:20px; color:#666;"><i class="fas fa-spinner fa-spin"></i> Đang tính toán lộ trình...</div>';
    }

    function createCustomMarker(map, lat, lng, color, label, popup) {
        const icon = L.divIcon({
            html: `<div style="background:${color}; color:white; width:30px; height:30px; border-radius:50%; display:flex; align-items:center; justify-content:center; border:2px solid white; box-shadow:0 2px 5px rgba(0,0,0,0.3); font-weight:bold;">${label}</div>`,
            className: '', iconSize: [30, 30], iconAnchor: [15, 15]
        });
        L.marker([lat, lng], { icon }).addTo(routeLayerGroup).bindPopup(popup);
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
// 7. GLOBAL FUNCTIONS (CHO CÁC NÚT BẤM TRÊN HTML)
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
    // alert(`💰 Đã chọn: ${choice.type} - Giá: ${choice.price}`);
    // Code logic đặt xe tiếp theo ở đây...
    alert(`Đã chọn ${choice.type}. Tính năng đặt xe đang phát triển!`);
};

window.goToPreviousPage = () => window.history.back();
window.goBack = () => window.location.href = '/chatbot';
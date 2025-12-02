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

        // [FIX] Thay thế toàn bộ hàm recalculateRoute cũ bằng hàm này trong map_trans.js

    async function recalculateRoute() {
        console.log("🔄 Đang tính toán lại lộ trình...");
        updateAllVehicleCardsDefault();

        try {
            // 1. Lấy dữ liệu từ LocalStorage để biết có những điểm trung gian nào không
            const storedRoute = getStoredRouteFromStorage();
            // Nếu trong storage có danh sách waypoints (nhiều hơn 2 điểm)
            const isMultiStop = storedRoute && storedRoute.waypoints && storedRoute.waypoints.length > 2;

            let url, body;

            if (isMultiStop) {
                // === TRƯỜNG HỢP 1: ĐA ĐIỂM (MULTI-STOP) ===
                // Gọi API /plan-trip (giống như bên form.js đã làm)
                url = '/api/plan-trip';
                body = {
                    start_id: currentStart.name, // Dùng tên để backend tìm tọa độ
                    destinations: storedRoute.waypoints.slice(1).map(wp => wp.name), // Lấy danh sách điểm đến (bỏ điểm đầu)
                    vehicle_type: 'car'
                };
            } else {
                // === TRƯỜNG HỢP 2: ĐI 1 CHẶNG (A -> B) ===
                url = '/api/find-route-osm';
                body = {
                    start: currentStart,
                    end: currentEnd,
                    vehicle_type: 'car'
                };
            }

            // 2. Gọi API
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            const result = await response.json();

            if (result.success) {
                let routeData = result.data;
                let finalCoords = [];
                let totalDist = 0;
                let waypoints = [];

                // 3. Xử lý dữ liệu trả về (Chuẩn hóa vì 2 API trả về khác nhau)
                if (isMultiStop) {
                    // API plan-trip trả về segments
                    totalDist = routeData.total_distance_km;
                    waypoints = routeData.optimized_order || storedRoute.waypoints;
                    
                    // Nối các đoạn đường lại để vẽ
                    if (routeData.segments) {
                        routeData.segments.forEach(seg => {
                            if (seg.geometry) finalCoords = finalCoords.concat(seg.geometry);
                        });
                    }
                } else {
                    // API find-route-osm trả về coordinates thẳng
                    totalDist = routeData.distance_km;
                    finalCoords = routeData.route_coordinates;
                    waypoints = [currentStart, currentEnd];
                }

                // 4. Vẽ lại lên Map (Nhớ dùng hàm drawRouteOnMap mới tôi đã gửi ở tin nhắn trước)
                // Lưu ý: Phải truyền waypoints vào để vẽ các điểm dừng
                drawRouteOnMap(finalCoords, currentStart, currentEnd, waypoints);

                // 5. Tính lại tiền (Quan trọng: totalDist bây giờ đã đúng là tổng các chặng)
                await fetchAndRenderTransportOptions(totalDist);

                // 6. Cập nhật lại Storage
                const newStorage = {
                    ...storedRoute,
                    route_coordinates: finalCoords,
                    distance_km: totalDist,
                    waypoints: waypoints
                };
                localStorage.setItem('selectedRoute', JSON.stringify(newStorage));

            } else {
                alert("Không tìm thấy đường đi: " + (result.error || "Lỗi không xác định"));
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

    // =========================================================================
    // [MỚI] XỬ LÝ KÉO THẢ BOTTOM SHEET
    // =========================================================================
    const dragHandle = document.getElementById('dragHandle');
    const panel = document.getElementById('vehicleOptionsPanel');
    
    let isDragging = false;
    let startY = 0;
    let startHeight = 0;

    // 1. Bắt đầu kéo (Mouse & Touch)
    const startDrag = (e) => {
        isDragging = true;
        // Lấy tọa độ Y của chuột hoặc ngón tay
        startY = e.clientY || e.touches[0].clientY;
        // Lấy chiều cao hiện tại của khung (px)
        startHeight = parseInt(window.getComputedStyle(panel).height, 10);
        
        panel.style.transition = 'none'; // Tắt transition để kéo cho mượt, không bị delay
    };

    dragHandle.addEventListener('mousedown', startDrag);
    dragHandle.addEventListener('touchstart', startDrag);

    // 2. Đang kéo (Mouse & Touch)
    const onDrag = (e) => {
        if (!isDragging) return;

        const clientY = e.clientY || e.touches[0].clientY;
        
        // Tính khoảng cách đã di chuyển
        // Kéo lên (Y giảm) -> Chiều cao TĂNG. Kéo xuống (Y tăng) -> Chiều cao GIẢM.
        const deltaY = startY - clientY;
        const newHeight = startHeight + deltaY;

        // Cập nhật chiều cao (CSS đã có min/max-height chặn rồi nên cứ set thoải mái)
        panel.style.height = `${newHeight}px`;
    };

    document.addEventListener('mousemove', onDrag);
    document.addEventListener('touchmove', onDrag, { passive: false });

    // 3. Kết thúc kéo
    const endDrag = () => {
        if (!isDragging) return;
        isDragging = false;
        panel.style.transition = 'height 0.3s ease'; // Bật lại transition cho đẹp
        
        // (Optional) Hiệu ứng Snap: Tự động hít về các mốc
        // Nếu muốn khung tự động co về 40% hoặc mở 85% khi thả tay, bạn có thể code thêm ở đây.
        // Hiện tại để tự do (free resize) theo yêu cầu.
    };

    document.addEventListener('mouseup', endDrag);
    document.addEventListener('touchend', endDrag);
});

// =============================================================================
// 7. GLOBAL FUNCTIONS (CHO CÁC NÚT BẤM TRÊN HTML)
// =============================================================================

window.switchTab = function(arg1, arg2) {
    const tabName = (typeof arg1 === 'string') ? arg1 : arg2;
    if (tabName === 'ai' || tabName === 'chatbot') window.location.href = '/chatbot';
};

window.confirmRoute = function() {
    // =============================================================================
    // 7. GLOBAL FUNCTIONS (ĐÃ CẬP NHẬT LOGIC CHUYỂN APP)
    // =============================================================================
    
    // Danh sách liên kết của các hãng (Bạn có thể cập nhật link xịn hơn nếu có)
    const BRAND_LINKS = {
        'grab': 'https://www.grab.com/vn/download/',   // Trang tải Grab
        'be': 'https://be.com.vn/',                    // Trang chủ Be
        'xanh': 'https://www.xanhsm.com/',             // Trang chủ Xanh SM
        'bus': 'https://busmap.vn/',                   // BusMap
        'vinbus': 'https://vinbus.vn/',                // VinBus
        'google': 'https://www.google.com/maps/dir/'   // Google Maps (cho xe cá nhân)
    };
    
    window.confirmRoute = function() {
        // 1. Tìm thẻ xe đang được chọn
        const selectedCard = document.querySelector('.option-card.selected');
        
        if (!selectedCard) {
            // Nếu có SweetAlert2 thì dùng, không thì dùng alert thường
            if (typeof Swal !== 'undefined') {
                Swal.fire('Chưa chọn xe', 'Vui lòng chọn một phương tiện để tiếp tục', 'warning');
            } else {
                alert("Vui lòng chọn một phương tiện!");
            }
            return;
        }
        
        // 2. Lấy thông tin xe
        const vehicleName = selectedCard.dataset.vehicle.toLowerCase(); // VD: "grabcar 4 chỗ"
        let targetUrl = '';
    
        // 3. Logic định tuyến (Routing Logic)
        if (vehicleName.includes('grab')) {
            targetUrl = BRAND_LINKS.grab;
        } 
        else if (vehicleName.includes('be') && !vehicleName.includes('bến')) { 
            // Tránh nhầm với "Bến xe"
            targetUrl = BRAND_LINKS.be;
        } 
        else if (vehicleName.includes('xanh') || vehicleName.includes('gsm')) {
            targetUrl = BRAND_LINKS.xanh;
        } 
        else if (vehicleName.includes('buýt') || vehicleName.includes('bus')) {
            targetUrl = BRAND_LINKS.bus;
        } 
        else {
            // Với xe máy cá nhân hoặc đi bộ -> Mở Google Maps chỉ đường
            // Lấy tọa độ điểm đến từ biến toàn cục (nếu có) hoặc mở Maps trống
            targetUrl = BRAND_LINKS.google;
        }
    
        // 4. Xác nhận và Chuyển trang
        const confirmMessage = `Bạn đã chọn ${selectedCard.dataset.vehicle}.\nChúng tôi sẽ chuyển bạn đến ứng dụng của hãng để đặt xe.`;
        
        if (typeof Swal !== 'undefined') {
            Swal.fire({
                title: 'Xác nhận chuyển hướng',
                text: `Mở ứng dụng/website của ${selectedCard.dataset.vehicle}?`,
                icon: 'info',
                showCancelButton: true,
                confirmButtonColor: '#3C7363',
                cancelButtonColor: '#d33',
                confirmButtonText: 'Đi ngay',
                cancelButtonText: 'Hủy'
            }).then((result) => {
                if (result.isConfirmed) {
                    window.open(targetUrl, '_blank'); // Mở tab mới
                }
            });
        } else {
            // Fallback nếu không có SweetAlert2
            if (confirm(confirmMessage)) {
                window.open(targetUrl, '_blank');
            }
        }
    };
};

window.goToPreviousPage = () => window.history.back();
window.goBack = () => window.location.href = '/chatbot';
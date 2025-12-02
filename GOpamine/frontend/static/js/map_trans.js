/**
 * 🚌 GOPamine - Map & Transport Logic (Multi-stop UI Version)
 * ===========================================================
 * - Hỗ trợ nhập liệu nhiều điểm (A, B, C...) động.
 * - Đồng bộ hoàn toàn giữa Form Input và Map Marker.
 */

document.addEventListener('DOMContentLoaded', async function() {
    
    // =========================================================================
    // 1. KHỞI TẠO BẢN ĐỒ & LAYER
    // =========================================================================
    
    let routeLayerGroup = L.layerGroup();
    // [STATE MỚI] Quản lý danh sách điểm bằng mảng
    let currentWaypoints = [
        { lat: null, lon: null, name: '' }, // Điểm A (Start)
        { lat: null, lon: null, name: '' }  // Điểm B (End mặc định)
    ];

    const map = L.map('map', { zoomControl: false, zoom: 13 });
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap', maxZoom: 19
    }).addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    
    routeLayerGroup.addTo(map);

    // =========================================================================
    // 2. LOAD DỮ LIỆU TỪ STORAGE
    // =========================================================================

    try {
        const storedRoute = getStoredRouteFromStorage();
        
        if (storedRoute && storedRoute.waypoints && storedRoute.waypoints.length >= 2) {
            // Load waypoints từ storage vào state
            currentWaypoints = storedRoute.waypoints.map(wp => ({
                lat: parseFloat(wp.lat),
                lon: parseFloat(wp.lon || wp.lng),
                name: wp.name
            }));

            // Vẽ Map ngay
            drawRouteOnMap(storedRoute.route_coordinates, null, null, currentWaypoints);
            
            // Render Bảng giá
            updateAllVehicleCardsDefault();
            await fetchAndRenderTransportOptions(storedRoute.distance_km);
            
            // Auto select xe cũ
            if (storedRoute.vehicle) {
                setTimeout(() => {
                    const card = document.querySelector(`.option-card[data-vehicle="${storedRoute.vehicle.type}"]`);
                    if (card) card.click();
                }, 500);
            }
        } else {
            // Mặc định TP.HCM
            map.setView([10.7769, 106.7009], 13);
        }
    } catch (err) {
        console.error("❌ Lỗi khởi tạo Map:", err);
        localStorage.removeItem('selectedRoute');
    }

    // Render giao diện Input lần đầu
    renderInputPanel();

    // =========================================================================
    // 3. LOGIC GIAO DIỆN INPUT (DYNAMIC UI)
    // =========================================================================

    function renderInputPanel() {
        const container = document.getElementById('route-inputs-container');
        if (!container) return;
        container.innerHTML = ''; // Xóa cũ

        currentWaypoints.forEach((wp, index) => {
            // Logic cho phép xóa:
            // - Luôn giữ ít nhất 2 điểm.
            // - Nếu > 2 điểm, cho phép xóa bất kỳ (trừ khi bạn muốn fix điểm A).
            // Ở đây tôi cho phép xóa tất cả nếu > 2 điểm, nhưng luôn giữ A và B nếu chỉ còn 2.
            const isRemovable = currentWaypoints.length > 2;

            const row = createRouteInputRow(
                index, 
                wp, 
                isRemovable, 
                handleWaypointUpdate, // Callback khi chọn địa điểm
                handleWaypointRemove  // Callback khi xóa
            );

            // [TINH CHỈNH MÀU SẮC ICON]
            // Ghi đè màu icon để khớp với Map (A xanh, Cuối đỏ, Giữa vàng)
            const iconDiv = row.querySelector('.waypoint-icon');
            if (index === 0) iconDiv.style.backgroundColor = '#4285f4'; // Xanh
            else if (index === currentWaypoints.length - 1) iconDiv.style.backgroundColor = '#ea4335'; // Đỏ
            else iconDiv.style.backgroundColor = '#fbbc04'; // Vàng

            container.appendChild(row);
        });
    }

    // Xử lý khi người dùng chọn địa điểm từ Autocomplete
    function handleWaypointUpdate(index, placeData) {
        // Cập nhật State
        currentWaypoints[index] = {
            lat: parseFloat(placeData.lat),
            lon: parseFloat(placeData.lon),
            name: placeData.name.split(',').slice(0, 2).join(',')
        };

        console.log(`📍 Cập nhật điểm ${index}:`, currentWaypoints[index]);

        // Kiểm tra xem đã đủ điều kiện tính đường chưa?
        // (Tất cả các điểm phải có lat/lon hợp lệ)
        const isValid = currentWaypoints.every(wp => wp.lat && wp.lon);
        
        if (isValid) {
            recalculateRoute();
        }
    }

    // Xử lý khi người dùng xóa điểm
    function handleWaypointRemove(index) {
        if (currentWaypoints.length <= 2) return; // Không cho xóa nếu chỉ còn 2 điểm

        currentWaypoints.splice(index, 1); // Xóa khỏi mảng
        renderInputPanel(); // Vẽ lại giao diện input
        recalculateRoute(); // Tính lại đường
    }

    // Xử lý nút "Thêm điểm đến"
    const addBtn = document.getElementById('add-stop-btn');
    if (addBtn) {
        addBtn.addEventListener('click', () => {
            // Thêm một điểm trống vào cuối
            currentWaypoints.push({ lat: null, lon: null, name: '' });
            renderInputPanel();
        });
    }

    // =========================================================================
    // 4. LOGIC TÍNH TOÁN LỘ TRÌNH (API)
    // =========================================================================

    async function recalculateRoute() {
        // Log để debug xem mảng hiện tại có gì
        console.log("🔄 Đang tính toán lại lộ trình cho:", currentWaypoints);
        
        // Cần ít nhất 2 điểm hợp lệ (có lat, lon) mới tính được
        // Lọc bỏ các điểm chưa chọn xong (lat = null)
        const validWaypoints = currentWaypoints.filter(wp => wp.lat && wp.lon);
        
        if (validWaypoints.length < 2) {
            console.log("⚠️ Chưa đủ 2 điểm hợp lệ để tính đường.");
            return;
        }

        updateAllVehicleCardsDefault();

        try {
            const isMultiStop = validWaypoints.length > 2;
            let url, body;

            if (isMultiStop) {
                // === TRƯỜNG HỢP NHIỀU ĐIỂM ===
                url = '/api/plan-trip';
                body = {
                    start: validWaypoints[0], 
                    // Lấy tất cả các điểm còn lại làm destinations
                    destinations: validWaypoints.slice(1).map(wp => wp.name),
                    vehicle_type: 'car'
                };
            } else {
                // === TRƯỜNG HỢP 2 ĐIỂM (SỬA LỖI TẠI ĐÂY) ===
                // Dùng trực tiếp phần tử đầu và cuối của mảng validWaypoints
                // Thay vì dùng biến currentStart/currentEnd cũ kĩ
                url = '/api/find-route-osm';
                body = {
                    start: validWaypoints[0],
                    end: validWaypoints[1],
                    vehicle_type: 'car'
                };
            }

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
                let optimizedWaypoints = [];

                if (isMultiStop) {
                    totalDist = routeData.total_distance_km;
                    
                    // Backend trả về danh sách đã tối ưu
                    // Logic cập nhật state để giao diện input nhảy theo thứ tự mới
                    optimizedWaypoints = routeData.optimized_order || validWaypoints;
                    currentWaypoints = optimizedWaypoints; // [QUAN TRỌNG] Đồng bộ state
                    renderInputPanel(); // Vẽ lại input theo thứ tự mới
                    
                    if (routeData.segments) {
                        routeData.segments.forEach(seg => {
                            if (seg.geometry) finalCoords = finalCoords.concat(seg.geometry);
                        });
                    }
                } else {
                    // Xử lý 2 điểm
                    totalDist = routeData.distance_km;
                    finalCoords = routeData.route_coordinates;
                    // Với 2 điểm, thứ tự chính là thứ tự trong mảng
                    optimizedWaypoints = validWaypoints; 
                }

                // Vẽ Map
                drawRouteOnMap(finalCoords, null, null, optimizedWaypoints);
                
                // Tính tiền
                await fetchAndRenderTransportOptions(totalDist);

                // Lưu Storage
                const newStorage = {
                    start_place: optimizedWaypoints[0],
                    end_place: optimizedWaypoints[optimizedWaypoints.length - 1],
                    route_coordinates: finalCoords,
                    distance_km: totalDist,
                    waypoints: optimizedWaypoints,
                    vehicle: getStoredRouteFromStorage()?.vehicle || { type: 'car' }
                };
                localStorage.setItem('selectedRoute', JSON.stringify(newStorage));

            } else {
                alert("Không tìm thấy đường đi: " + (result.error || "Lỗi server"));
                // Reset lại UI nếu lỗi để không bị treo loading
                document.querySelector('.vehicle-scroll-container').innerHTML = '';
            }
        } catch (error) {
            console.error("Lỗi tính lộ trình:", error);
            alert("Có lỗi xảy ra khi kết nối server.");
            document.querySelector('.vehicle-scroll-container').innerHTML = '';
        }
    }

    // =========================================================================
    // 5. CÁC HÀM TIỆN ÍCH KHÁC (GIỮ NGUYÊN)
    // =========================================================================

    function createCustomMarker(map, lat, lng, color, label, popupContent) {
        const svgIcon = `
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="42" viewBox="0 0 32 42">
                <path fill="${color}" d="M16 0C7.163 0 0 7.163 0 16c0 12 16 26 16 26s16-14 16-26C32 7.163 24.837 0 16 0z" stroke="white" stroke-width="2"/>
                <circle cx="16" cy="16" r="10" fill="white" opacity="0.2"/>
                <text x="50%" y="21" font-family="Arial, sans-serif" font-size="14" font-weight="bold" fill="white" text-anchor="middle">${label}</text>
            </svg>`;

        const icon = L.divIcon({
            html: svgIcon,
            className: 'custom-svg-marker',
            iconSize: [32, 42],
            iconAnchor: [16, 42],
            popupAnchor: [0, -45]
        });

        L.marker([lat, lng], { icon: icon, zIndexOffset: 1000 })
            .addTo(routeLayerGroup)
            .bindPopup(`<div style="text-align:center; font-weight:bold; color:${color}">${label}. ${popupContent}</div>`);
    }

    function drawRouteOnMap(coords, start, end, waypoints) {
        routeLayerGroup.clearLayers(); 

        const pointsToDraw = (waypoints && waypoints.length > 0) ? waypoints : [start, end];

        pointsToDraw.forEach((point, index) => {
            if (!point || typeof point !== 'object') return;

            const label = String.fromCharCode(65 + index);
            let color = '#fbbc04'; 
            if (index === 0) color = '#4285f4'; 
            else if (index === pointsToDraw.length - 1) color = '#ea4335';

            const lat = parseFloat(point.lat);
            const lng = parseFloat(point.lon || point.lng);
            
            if (!isNaN(lat) && !isNaN(lng)) {
                createCustomMarker(map, lat, lng, color, label, point.name);
            }
        });

        if (coords && coords.length > 0) {
            const latlngs = coords.map(c => [c[1], c[0]]);
            L.polyline(latlngs, { color: 'white', weight: 7, opacity: 0.8 }).addTo(routeLayerGroup);
            const mainLine = L.polyline(latlngs, { color: '#4285f4', weight: 5 }).addTo(routeLayerGroup);
            map.fitBounds(mainLine.getBounds(), { paddingTopLeft: [20, 20], paddingBottomRight: [20, 250] });
        }
    }

    async function fetchAndRenderTransportOptions(distanceKm) {
        try {
            let priorities = ['saving', 'speed'];
            try {
                const formData = JSON.parse(localStorage.getItem('formData'));
                if (formData?.preferences) priorities = formData.preferences;
            } catch (e) {}

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
            document.querySelector('.vehicle-scroll-container').innerHTML = '<div style="text-align:center; padding:10px;">Lỗi kết nối.</div>';
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
        document.querySelector('.vehicle-scroll-container').innerHTML = '<div style="text-align:center; padding:20px; color:#666;"><i class="fas fa-spinner fa-spin"></i> Đang tính toán...</div>';
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

    // Logic Kéo thả Bottom Sheet
    const dragHandle = document.getElementById('dragHandle');
    const panel = document.getElementById('vehicleOptionsPanel');
    if (dragHandle && panel) {
        let isDragging = false, startY = 0, startHeight = 0;
        const startDrag = (e) => {
            isDragging = true;
            startY = e.clientY || e.touches[0].clientY;
            startHeight = parseInt(window.getComputedStyle(panel).height, 10);
            panel.style.transition = 'none'; 
        };
        const onDrag = (e) => {
            if (!isDragging) return;
            const clientY = e.clientY || e.touches[0].clientY;
            const newHeight = startHeight + (startY - clientY);
            panel.style.height = `${newHeight}px`;
        };
        const endDrag = () => { isDragging = false; panel.style.transition = 'height 0.3s ease'; };
        dragHandle.addEventListener('mousedown', startDrag);
        dragHandle.addEventListener('touchstart', startDrag);
        document.addEventListener('mousemove', onDrag);
        document.addEventListener('touchmove', onDrag, { passive: false });
        document.addEventListener('mouseup', endDrag);
        document.addEventListener('touchend', endDrag);
    }
});

window.switchTab = (arg1, arg2) => {
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
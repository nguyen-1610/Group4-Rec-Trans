// ========== BIẾN GLOBAL - Truy cập từ busmap.js ==========
window.mapInstance = null;          // Leaflet map object
window.routeLayerGroup = null;      // Layer group chứa routes
window.originalVehicleListHTML = null; // Backup HTML list
/**
 * 🚌 GOPamine - Map & Transport Logic (Multi-stop UI Version)
 * ===========================================================
 * - Hỗ trợ nhập liệu nhiều điểm (A, B, C...) động.
 * - Đồng bộ hoàn toàn giữa Form Input và Map Marker.
 */

document.addEventListener('DOMContentLoaded', async function() {
    
    // 1. KHỞI TẠO TỪ ĐIỂN NGÔN NGỮ
    const i18n = {
        vi: {
            map_add_stop: "Thêm điểm đến",
            map_consult_ai: "Tư Vấn Với AI",
            map_select_btn: "Chọn",
            map_unit_min: "phút",
            map_unit_km: "km",
            map_loading: "Đang tính toán...",
            map_alert_select: "Vui lòng chọn một phương tiện!",
            map_alert_route_error: "Không tìm thấy đường đi:",
            ph_start: "Nhập điểm đi...",
            ph_dest: "Tìm kiếm địa điểm",
            lbl_vehicle: "Xe",
            lbl_price: "Giá",

            alert_title_redirect: "Chuyển hướng",
            alert_desc_redirect: "Mở ứng dụng",
            alert_title_select: "Chưa chọn xe",
            btn_go: "Đi ngay",
            btn_cancel: "Hủy",

            // Tên phương tiện
            mode_walking: "Đi bộ",
            mode_bus: "Xe buýt",
            mode_motorbike: "Xe máy",
            mode_car: "Ô tô",
            
            // Các tag/nhãn
            tag_cheap: "Rẻ",
            tag_fast: "Nhanh",
            tag_saving: "Tiết kiệm",
            tag_eco: "Xe điện",
        },
        en: {
            map_add_stop: "Add Destination",
            map_consult_ai: "Ask AI Assistant",
            map_select_btn: "Select",
            map_unit_min: "min",
            map_unit_km: "km",
            map_loading: "Calculating...",
            map_alert_select: "Please select a vehicle!",
            map_alert_route_error: "Route not found:",
            ph_start: "Enter start point...",
            ph_dest: "Search destination",
            lbl_vehicle: "Vehicle",
            lbl_price: "Price",

            alert_title_redirect: "Redirecting",
            alert_desc_redirect: "Open app",
            alert_title_select: "No vehicle selected",
            btn_go: "Go",
            btn_cancel: "Cancel",

            // Vehicle names
            mode_walking: "Walking",
            mode_bus: "Bus",
            mode_motorbike: "Motorbike",
            mode_car: "Car",
            
            // Tags
            tag_cheap: "Cheap",
            tag_fast: "Fast",
            tag_saving: "Saving",
            tag_eco: "Electric",
        }
    };

    // 2. HÀM LẤY TEXT DỊCH (Helper)
    window.getTrans = function(key) {
        // Lấy ngôn ngữ từ localStorage (lưu từ trang Home)
        const lang = localStorage.getItem('userLang') || localStorage.getItem('language') || 'vi';
        const dict = i18n[lang] || i18n['vi'];
        return dict[key] || key;
    };

    // 3. HÀM DỊCH GIAO DIỆN TĨNH (Chạy 1 lần khi load)
    function applyStaticTranslations() {
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            el.textContent = window.getTrans(key);
        });
    }
    applyStaticTranslations();

    // [STATE MỚI] Quản lý vị trí người dùng
    let userLocationMarker = null; // Chấm tròn xanh
    let userLocationCircle = null; // Vòng tròn sai số (Accuracy)
    let isUserTracking = false;    // Trạng thái có đang bám theo người dùng không
    // =========================================================================
    // 1. KHỞI TẠO BẢN ĐỒ & LAYER
    // =========================================================================
    
    let routeLayerGroup = L.layerGroup();
    // [STATE MỚI] Quản lý danh sách điểm bằng mảng
    let currentWaypoints = [
        { lat: null, lon: null, name: '' }, // Điểm A (Start)
        { lat: null, lon: null, name: '' }  // Điểm B (End mặc định)
    ];

    const map = L.map('map', { zoomControl: false, zoom: 13 }).setView([10.8231, 106.6297], 13);
    // Khi khởi tạo map:
    window.mapInstance = map;
    // ^^^^ GÁN VÀO WINDOW
    
    window.routeLayerGroup = L.layerGroup().addTo(window.mapInstance);
    
    // ✅ Khai báo global để busmap.js dùng
    window.originalVehicleListHTML = null; // ✅ Khai báo global để busmap.js dùng
  
    
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

        // [MỚI] Nếu cập nhật điểm đầu tiên (Index 0), hãy vẽ lại Chấm Xanh
        if (index === 0) {
            updateStartPointBlueDot();
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

        // Hàm hỗ trợ dịch tên xe (Mapping)
        const translateModeName = (originalName) => {
            const n = originalName.toLowerCase();
            // Nếu là tên hãng (Grab, Be, Xanh) thì giữ nguyên, chỉ dịch loại xe chung
            if (n.includes('đi bộ') || n.includes('walk')) return window.getTrans('mode_walking');
            if (n.includes('buýt') || n.includes('bus')) return window.getTrans('mode_bus');
            // Với các hãng xe công nghệ, ta thường giữ nguyên tên thương hiệu (GrabBike, XanhSM...)
            // Nhưng nếu muốn dịch phần đuôi (Bike/Car) thì xử lý thêm ở đây.
            // Hiện tại ta ưu tiên dịch các loại cơ bản user phàn nàn.
            return originalName; 
        };

        backendResults.forEach(item => {
            const icon = getIcon(item.mode_name);
            // --- [LOGIC DỊCH THUẬT] ---
            // 1. Dịch đơn vị thời gian (phút / min)
            const durationText = `${item.duration} ${window.getTrans('map_unit_min')}`;

            // 1. Dịch Tên phương tiện (Fix lỗi "Đi bộ" khi đang EN)
            const displayModeName = translateModeName(item.mode_name);

            // 2. Dịch các nhãn (tags)
            const tagsHtml = item.labels.map(l => {
                let labelText = l;
                const lowerL = l.toLowerCase();
                
                // Map các từ khóa tiếng Việt sang key từ điển
                if (lowerL.includes("tiết kiệm")) labelText = window.getTrans('tag_saving');
                else if (lowerL.includes("nhanh") || lowerL.includes("fast")) labelText = window.getTrans('tag_fast');
                else if (lowerL.includes("rẻ")) labelText = window.getTrans('tag_cheap');
                else if (lowerL.includes("điện") || lowerL.includes("eco")) labelText = window.getTrans('tag_eco');
                
                
                return `<span style="font-size:10px; background:#e3f2fd; color:#1565c0; padding:2px 5px; border-radius:3px; margin-right:3px;">${labelText}</span>`;
            }).join('');

            const scoreColor = item.score >= 8.5 ? '#4caf50' : (item.score >= 6 ? '#ff9800' : '#f44336');

            const cardHtml = `
                <div class="option-card" 
                     data-vehicle="${item.mode_name}" 
                     data-price="${item.display_price}" 
                     data-time="${item.duration} ${window.getTrans('map_unit_min')}"
                     data-score="${item.score}">
                    
                    <div class="option-left">
                        <div class="vehicle-icon" style="font-size: 20px;">${icon}</div>
                        <div class="vehicle-info">
                            <h4 style="margin: 0 0 4px 0;">${displayModeName}</h4>
                            
                            <div style="font-size: 13px; color: #555; line-height: 1.4;">
                                <span style="font-weight:bold; color:#333;">${durationText}</span> • ${distanceKm.toFixed(1)} ${window.getTrans('map_unit_km')}
                                
                                <div style="margin-top: 6px; display: flex; gap: 4px; flex-wrap: wrap;">
                                    ${tagsHtml}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="option-right">
                        <div class="price" style="font-weight: bold; font-size: 15px; color:#2c3e50;">${item.display_price}</div>
                        <div class="vehicle-score-new" style="color: ${scoreColor}; display: flex; align-items: center; justify-content: flex-end; gap: 4px; margin-top: 4px; font-size: 13px; font-weight: bold;">
                            <span style="color: #FFD700; font-size: 14px;">★</span> ${item.score}/10
                        </div>
                    </div>
                </div>
            `;
            container.insertAdjacentHTML('beforeend', cardHtml);
        });

        setupCardSelectionEvents();
        console.log('✅ Đã gắn event listeners cho', document.querySelectorAll('.option-card').length, 'cards');
        const firstCard = container.querySelector('.option-card');
        if(firstCard) firstCard.classList.add('selected');
    }

    function updateAllVehicleCardsDefault() {
        const text = window.getTrans('map_loading'); 
        document.querySelector('.vehicle-scroll-container').innerHTML = 
        `<div style="text-align:center; padding:20px; color:#666;">
            <i class="fas fa-spinner fa-spin"></i> ${text}
        </div>`;
    }

    function setupCardSelectionEvents() {
        document.querySelectorAll('.option-card').forEach(card => {
            card.addEventListener('click', function() {
                // 1. Highlight card
                document.querySelectorAll('.option-card').forEach(c => c.classList.remove('selected'));
                this.classList.add('selected');

                 // 2. ========== KIỂM TRA LOẠI XE ==========
                const vehicleMode = this.getAttribute('data-vehicle') || '';
                
                console.log('🚗 Chọn phương tiện:', vehicleMode);
                // 3. Nếu là BUS → Gọi logic riêng
                 const isBusMode = vehicleMode.toLowerCase().includes('bus') 
                    || vehicleMode.toLowerCase().includes('buýt')
                    || vehicleMode.toLowerCase().includes('xe buýt');
                    if (isBusMode) {
                    console.log('🚌 Kích hoạt Bus logic...');

                    if (typeof drawRouteOnMap === 'function') {
                         // Tham số: (coords, start, end, waypoints)
                        drawRouteOnMap([], null, null, currentWaypoints);
                        console.log('✅ Đã refresh lại điểm A/B và xóa đường cũ');
                    }

                    // 2. Dọn dẹp phụ (Routing Machine Control nếu có)
                    // Vì cái này thường không nằm trong routeLayerGroup nên phải xóa tay
                    const map = (typeof getMapInstance === 'function') ? getMapInstance() : window.mapInstance;
                    if (window.routingControl && map) {
                        try { map.removeControl(window.routingControl); } catch (e) {}
                        window.routingControl = null;
                    }
                    document.querySelectorAll('.leaflet-routing-container').forEach(el => el.remove());

                    // ============================================================

                    // ========== BACKUP HTML TRƯỚC KHI GỌI BUS ==========
                    if (!window.originalVehicleListHTML) {
                        const container = document.querySelector('.vehicle-scroll-container');
                        window.originalVehicleListHTML = container.innerHTML;
                    }
                    // =================================================
                    // Gọi hàm từ busmap.js
                    if (typeof handleBusSelection === 'function') {
                        handleBusSelection();
                    } else {
                        console.error('❌ Hàm handleBusSelection không tồn tại!');
                    }
                }
                // 4. Các xe khác (Grab/Be) → Logic cũ
                else {
                    console.log('🚗 Xe Grab/Be - Giữ nguyên');
                    // Code vẽ route Grab/Be của bạn (nếu có)
                }
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

    
    // =========================================================================
    // [FINAL] LOGIC: 1 CHẤM XANH (GPS) & NÚT VỀ GHIM A
    // =========================================================================

    // 1. Icon Chấm Xanh (GPS Thực tế)
    // Sử dụng đúng class .user-dot và .user-pulse mà bạn đã có trong CSS
    const userGpsIcon = L.divIcon({
        className: 'user-location-marker',
        html: '<div class="user-pulse"></div><div class="user-dot"></div>',
        iconSize: [40, 40],
        iconAnchor: [20, 20]
    });
    
    // 2. Logic Hiển thị Chấm Xanh (Luôn chạy ngầm để biết mình đang ở đâu)
    map.locate({ watch: true, enableHighAccuracy: true });

    map.on('locationfound', function(e) {
        // Chỉ vẽ chấm xanh tại vị trí thực. KHÔNG tự động bay camera.
        if (!userLocationMarker) {
            userLocationMarker = L.marker(e.latlng, { icon: userGpsIcon, zIndexOffset: 400 }).addTo(map);
        } else {
            userLocationMarker.setLatLng(e.latlng);
        }
    });

    map.on('locationerror', function(e) {
        console.warn("⚠️ GPS Error:", e.message);
    });

    // 3. Logic Nút Bấm: TRỎ VÀO GHIM A (Điểm xuất phát)
    const recenterBtn = document.getElementById('btn-recenter-gps');
    if (recenterBtn) {
        // Icon Target/Mũi tên (SVG)
        recenterBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="24px" height="24px">
                <path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3A8.994 8.994 0 0 0 13 3.06V1h-2v2.06A8.994 8.994 0 0 0 3.06 11H1v2h2.06A8.994 8.994 0 0 0 11 20.94V23h2v-2.06A8.994 8.994 0 0 0 20.94 13H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z"/>
            </svg>
        `;
        
        recenterBtn.title = "Về điểm xuất phát"; 

        recenterBtn.addEventListener('click', function() {
            // Lấy tọa độ GHIM A (Điểm đầu tiên trong mảng currentWaypoints)
            // Ghim A này được tạo ra bởi hàm drawRouteOnMap -> Nó là ghim màu xanh lá/đỏ trên bản đồ
            const startPoint = currentWaypoints[0];

            if (startPoint && startPoint.lat && startPoint.lon) {
                // => CÓ ĐIỂM A: Bay thẳng tới đó
                console.log("📍 Bay về Ghim A:", startPoint.name);
                map.flyTo([startPoint.lat, startPoint.lon], 15, { animate: true, duration: 1.2 });
                
                // Hiệu ứng Toast báo cho user biết
                if(typeof Swal !== 'undefined') {
                    const Toast = Swal.mixin({
                        toast: true, position: 'top-end', showConfirmButton: false, timer: 2000
                    });
                    Toast.fire({ icon: 'info', title: 'Điểm xuất phát' });
                }
            } 
            else if (userLocationMarker) {
                // => KHÔNG CÓ ĐIỂM A: Bay về GPS (Dự phòng)
                map.flyTo(userLocationMarker.getLatLng(), 16, { animate: true, duration: 1.2 });
                
                if(typeof Swal !== 'undefined') {
                    const Toast = Swal.mixin({
                        toast: true, position: 'top-end', showConfirmButton: false, timer: 2000
                    });
                    Toast.fire({ icon: 'warning', title: 'Chưa có điểm xuất phát. Hiển thị vị trí thực.' });
                }
            } else {
                 // Fallback cuối cùng: Thử kích hoạt lại GPS
                 map.locate({ setView: true, maxZoom: 16 });
            }
        });
    }
    // =========================================================================
    window.drawRouteOnMap = drawRouteOnMap;
    window.setupCardSelectionEvents = setupCardSelectionEvents;
    
    // Kiểm tra xem đã public thành công chưa
    console.log("✅ Đã public hàm drawRouteOnMap và setupCardSelectionEvents");
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
                // [SỬA] Dùng getTrans
                Swal.fire(
                    window.getTrans('alert_title_select'), 
                    window.getTrans('map_alert_select'), 
                    'warning'
                );
            } else {
                    alert(window.getTrans('map_alert_select'));
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
                title: window.getTrans('alert_title_redirect'),
                text: `${window.getTrans('alert_desc_redirect')} ${selectedCard.dataset.vehicle}?`,
                icon: 'info',
                showCancelButton: true,
                confirmButtonColor: '#3C7363',
                cancelButtonColor: '#d33',
                confirmButtonText: window.getTrans('btn_go'),
                cancelButtonText: window.getTrans('btn_cancel')
            }).then((result) => {
                if (result.isConfirmed) window.open(targetUrl, '_blank');
            });
        } else {
            // Fallback nếu không có SweetAlert2
            if (confirm(`${window.getTrans('alert_desc_redirect')} ${selectedCard.dataset.vehicle}?`)) {
                window.open(targetUrl, '_blank');
            }
        }
    };
};

//======================================================================
// 8. LOGIC TƯ VẤN AI (FIX: GIẢ LẬP FORM DATA ĐỂ CHATBOT NHẬN DIỆN)
// =============================================================================

window.consultWithAI = async function() {
    const btn = document.querySelector('.btn-secondary'); 
    const originalText = btn ? btn.textContent : 'Tư Vấn Với AI';
    
    if (btn) {
        btn.textContent = 'Đang kết nối AI...';
        btn.disabled = true;
    }

    try {
        // 1. Lấy dữ liệu lộ trình
        const storedRouteJSON = localStorage.getItem('selectedRoute');
        if (!storedRouteJSON) throw new Error("Chưa có dữ liệu lộ trình.");

        const routeData = JSON.parse(storedRouteJSON);
        const waypoints = routeData.waypoints; // [Start, Stop1, ..., End]

        if (!waypoints || waypoints.length < 2) throw new Error("Lộ trình không hợp lệ.");

        const origin = waypoints[0];
        const destinations = waypoints.slice(1);

        // 2. CHUẨN BỊ PAYLOAD (Quan trọng: Format giống hệt form.js)
        // AI sẽ nhìn vào đây để biết user muốn gì
        const aiFormData = {
            origin: {
                name: origin.name,
                lat: origin.lat,
                lon: origin.lon || origin.lng
            },
            destinations: destinations.map(wp => ({
                name: wp.name,
                lat: wp.lat,
                lon: wp.lon || wp.lng
            })),
            // Các trường phụ trợ để AI không bị null
            budget: 0, 
            passengers: "1",
            preferences: ["Tối ưu đường đi", "Tiết kiệm thời gian"], 
            context_type: "route_consultation" // Cờ đánh dấu để AI biết là tư vấn map
        };
        
        console.log('📦 Đóng gói dữ liệu Map -> Form Data:', aiFormData);

        // 3. Gửi dữ liệu về Backend (Sync Session)
        let sessionId = localStorage.getItem('sessionId');
        if (sessionId) {
            await fetch('/api/form', { 
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    session_id: sessionId,
                    form_data: aiFormData
                })
            });
        }

        // 4. [QUAN TRỌNG NHẤT] Lưu vào localStorage key 'pendingFormData'
        // Đây chính là thứ mà chatbot.js sẽ kiểm tra khi load trang!
        localStorage.setItem('pendingFormData', JSON.stringify(aiFormData));
        
        // Đánh dấu thêm cờ này để chatbot biết không cần hỏi lại câu chào
        localStorage.setItem('msg_context', 'map_consultation'); 

        // 5. Chuyển trang
        window.location.href = '/chatbot';

    } catch (error) {
        console.error("❌ Lỗi:", error);
        alert(error.message);
        if (btn) {
            btn.textContent = originalText;
            btn.disabled = false;
        }
    }
};
// =============================================================================
// 9. HÀM QUAY LẠI TRANG TRƯỚC (CẢI TIẾN)
// =============================================================================

function goToPreviousPage(fallbackUrl = '/', ignorePaths = []) {
    const currentDomain = window.location.origin;
    const referrer = document.referrer;

    // 1. Kiểm tra cơ bản
    const isInternal = referrer && referrer.indexOf(currentDomain) === 0;

    // 2. Kiểm tra Vòng lặp
    const isIgnored = ignorePaths.some(path => referrer.includes(path));

    // LOGIC QUYẾT ĐỊNH
    if (isInternal && !isIgnored) {
        window.history.back();
    } else {
        console.log('🔄 Luồng không an toàn hoặc vòng lặp -> Về:', fallbackUrl);
        window.location.href = fallbackUrl;
    }
}

const backBtn = document.querySelector('.back-btn'); // Hoặc nút back trên map
if (backBtn) {
    backBtn.addEventListener('click', (e) => {
        e.preventDefault();
        
        // QUAN TRỌNG: Tại MAP mới cần chặn CHATBOT
        // Logic: Nếu vừa từ Chatbot về đây -> Bấm back phát nữa thì về Home luôn.
        goToPreviousPage('/', ['chatbot']); 
    });
}
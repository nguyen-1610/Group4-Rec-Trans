/**
 * 🚌 GOPamine - Map & Transport Logic (Robust Version)
 * ====================================================
 * - Fix lỗi trắng trang (Crash) do dữ liệu sai.
 * - Fix lỗi mất icon A, B, C (Dùng SVG).
 * - Hỗ trợ kéo thả bảng giá (Bottom Sheet).
 */

document.addEventListener('DOMContentLoaded', async function() {
    
    // =========================================================================
    // 1. KHỞI TẠO BẢN ĐỒ & LAYER
    // =========================================================================
    
    let routeLayerGroup = L.layerGroup();
    let currentStart = { lat: null, lon: null, name: '' };
    let currentEnd = { lat: null, lon: null, name: '' };

    const map = L.map('map', { zoomControl: false, zoom: 13 });
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap', maxZoom: 19
    }).addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    
    routeLayerGroup.addTo(map);

    // =========================================================================
    // 2. LOAD DỮ LIỆU AN TOÀN (SAFE LOAD)
    // =========================================================================

    try {
        const storedRoute = getStoredRouteFromStorage();
        
        if (storedRoute && storedRoute.start_place && storedRoute.end_place) {
            // Cập nhật State
            currentStart = { ...storedRoute.start_place, lon: storedRoute.start_place.lon || storedRoute.start_place.lng };
            currentEnd = { ...storedRoute.end_place, lon: storedRoute.end_place.lon || storedRoute.end_place.lng };
            
            // Điền input
            const inputStart = document.getElementById('map-origin');
            const inputEnd = document.getElementById('map-destination');
            if(inputStart) inputStart.value = currentStart.name || '';
            if(inputEnd) inputEnd.value = currentEnd.name || '';

            // [QUAN TRỌNG] Vẽ đường & Marker
            // Nếu waypoints bị lỗi (là string), fallback về [Start, End]
            let safeWaypoints = storedRoute.waypoints;
            if (safeWaypoints && safeWaypoints.length > 0 && typeof safeWaypoints[0] === 'string') {
                console.warn("⚠️ Dữ liệu cũ không tương thích, đang reset waypoints...");
                safeWaypoints = [currentStart, currentEnd];
            }

            drawRouteOnMap(storedRoute.route_coordinates, currentStart, currentEnd, safeWaypoints);
            
            // Render danh sách xe
            updateAllVehicleCardsDefault();
            await fetchAndRenderTransportOptions(storedRoute.distance_km);
            
            // Auto select
            if (storedRoute.vehicle) {
                setTimeout(() => {
                    const card = document.querySelector(`.option-card[data-vehicle="${storedRoute.vehicle.type}"]`);
                    if (card) card.click();
                }, 500);
            }
        } else {
            // Mặc định: TP.HCM
            map.setView([10.7769, 106.7009], 13);
        }
    } catch (err) {
        console.error("❌ Lỗi khởi tạo Map:", err);
        // Nếu lỗi quá nặng, xóa storage để lần sau không bị trắng trang
        localStorage.removeItem('selectedRoute');
        map.setView([10.7769, 106.7009], 13);
    }

    // =========================================================================
    // 3. LOGIC VẼ MAP & MARKER (DÙNG SVG ĐỂ KHÔNG BỊ MẤT)
    // =========================================================================

    function createCustomMarker(map, lat, lng, color, label, popupContent) {
        // [FIX] Dùng SVG để đảm bảo icon luôn hiển thị
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

        // 1. Vẽ Marker
        const pointsToDraw = (waypoints && Array.isArray(waypoints) && waypoints.length > 0) 
                             ? waypoints 
                             : [start, end];

        pointsToDraw.forEach((point, index) => {
            // Kiểm tra an toàn: Point phải là object có lat/lon
            if (!point || typeof point !== 'object') return;

            const label = String.fromCharCode(65 + index); // A, B, C...
            let color = '#fbbc04'; // Mặc định Vàng (Trung gian)
            
            if (index === 0) color = '#4285f4'; // Start: Xanh
            else if (index === pointsToDraw.length - 1) color = '#ea4335'; // End: Đỏ

            const lat = parseFloat(point.lat);
            const lng = parseFloat(point.lon || point.lng);
            
            if (!isNaN(lat) && !isNaN(lng)) {
                createCustomMarker(map, lat, lng, color, label, point.name || `Điểm ${label}`);
            }
        });

        // 2. Vẽ Đường (Polyline)
        if (coords && coords.length > 0) {
            const latlngs = coords.map(c => [c[1], c[0]]);
            // Vẽ viền trắng cho nổi bật
            L.polyline(latlngs, { color: 'white', weight: 7, opacity: 0.8 }).addTo(routeLayerGroup);
            // Vẽ đường chính
            const mainLine = L.polyline(latlngs, { color: '#4285f4', weight: 5 }).addTo(routeLayerGroup);
            
            // Zoom vừa khít
            map.fitBounds(mainLine.getBounds(), { 
                paddingTopLeft: [20, 20],
                paddingBottomRight: [20, 250] // Chừa chỗ cho bảng giá
            });
        }
    }

    // =========================================================================
    // 4. LOGIC TÍNH LẠI LỘ TRÌNH (KHI THAY ĐỔI ĐIỂM)
    // =========================================================================

    function handleMapInputUpdate(placeData, inputElement) {
        const newPlace = {
            lat: parseFloat(placeData.lat),
            lon: parseFloat(placeData.lon),
            name: placeData.name.split(',').slice(0, 2).join(',')
        };
        inputElement.dataset.placeData = JSON.stringify(newPlace);

        if (inputElement.id === 'map-origin') currentStart = newPlace;
        else if (inputElement.id === 'map-destination') currentEnd = newPlace;
        
        if (currentStart.lat && currentEnd.lat) {
            recalculateRoute();
        }
    }

    const originInput = document.getElementById('map-origin');
    const destInput = document.getElementById('map-destination');

    if (typeof setupAutocomplete === 'function') {
        if (originInput) setupAutocomplete(originInput, handleMapInputUpdate);
        if (destInput) setupAutocomplete(destInput, handleMapInputUpdate);
    }

    async function recalculateRoute() {
        console.log("🔄 Đang tính lại...");
        updateAllVehicleCardsDefault();

        try {
            const storedData = getStoredRouteFromStorage();
            const isMultiStop = storedData && storedData.waypoints && storedData.waypoints.length > 2;

            let url, body;
            if (isMultiStop) {
                // Multi-stop: Giữ nguyên danh sách điểm trung gian, chỉ thay đổi điểm đầu/cuối nếu user sửa input
                // (Logic này đơn giản hóa, thực tế cần phức tạp hơn nếu muốn sửa điểm giữa)
                url = '/api/plan-trip';
                body = {
                    start_id: currentStart.name,
                    destinations: storedData.waypoints.slice(1).map(wp => wp.name),
                    vehicle_type: 'car'
                };
            } else {
                url = '/api/find-route-osm';
                body = { start: currentStart, end: currentEnd, vehicle_type: 'car' };
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
                let waypoints = [];

                if (isMultiStop) {
                    totalDist = routeData.total_distance_km;
                    waypoints = routeData.optimized_order || storedData.waypoints;
                    if (routeData.segments) {
                        routeData.segments.forEach(seg => {
                            if (seg.geometry) finalCoords = finalCoords.concat(seg.geometry);
                        });
                    }
                } else {
                    totalDist = routeData.distance_km;
                    finalCoords = routeData.route_coordinates;
                    waypoints = [currentStart, currentEnd];
                }

                drawRouteOnMap(finalCoords, currentStart, currentEnd, waypoints);
                await fetchAndRenderTransportOptions(totalDist);

                const newStorage = {
                    ...storedData,
                    route_coordinates: finalCoords,
                    distance_km: totalDist,
                    waypoints: waypoints
                };
                localStorage.setItem('selectedRoute', JSON.stringify(newStorage));

            } else {
                alert("Không tìm thấy đường đi: " + (result.error || "Lỗi server"));
            }
        } catch (error) {
            console.error("Lỗi tính lộ trình:", error);
        }
    }

    // =========================================================================
    // 5. RENDER CARDS & UI
    // =========================================================================

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

    // =========================================================================
    // 6. XỬ LÝ KÉO THẢ (BOTTOM SHEET)
    // =========================================================================
    const dragHandle = document.getElementById('dragHandle');
    const panel = document.getElementById('vehicleOptionsPanel');
    
    if (dragHandle && panel) {
        let isDragging = false;
        let startY = 0;
        let startHeight = 0;

        const startDrag = (e) => {
            isDragging = true;
            startY = e.clientY || e.touches[0].clientY;
            startHeight = parseInt(window.getComputedStyle(panel).height, 10);
            panel.style.transition = 'none'; 
        };

        dragHandle.addEventListener('mousedown', startDrag);
        dragHandle.addEventListener('touchstart', startDrag);

        const onDrag = (e) => {
            if (!isDragging) return;
            const clientY = e.clientY || e.touches[0].clientY;
            const deltaY = startY - clientY;
            const newHeight = startHeight + deltaY;
            panel.style.height = `${newHeight}px`;
        };

        document.addEventListener('mousemove', onDrag);
        document.addEventListener('touchmove', onDrag, { passive: false });

        const endDrag = () => {
            if (!isDragging) return;
            isDragging = false;
            panel.style.transition = 'height 0.3s ease'; 
        };

        document.addEventListener('mouseup', endDrag);
        document.addEventListener('touchend', endDrag);
    }
});

// GLOBAL FUNCTIONS
window.switchTab = function(arg1, arg2) {
    const tabName = (typeof arg1 === 'string') ? arg1 : arg2;
    if (tabName === 'ai' || tabName === 'chatbot') window.location.href = '/chatbot';
};

window.confirmRoute = function() {
    const card = document.querySelector('.option-card.selected');
    if (!card) return alert("Vui lòng chọn một phương tiện!");
    alert(`Đã chọn ${card.dataset.vehicle}. Tính năng đặt xe đang phát triển!`);
};

window.goToPreviousPage = () => window.history.back();
window.goBack = () => window.location.href = '/chatbot';
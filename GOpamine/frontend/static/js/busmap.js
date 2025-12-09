
// =========================================================================
// 7. BUS LOGIC - XỬ LÝ VẼ BẢN ĐỒ CHI TIẾT
// =========================================================================

async function handleBusSelection() {
    console.log("🚌 Đang lấy lộ trình xe buýt chi tiết...");
    
    // 1. Lấy dữ liệu hành trình người dùng đã chọn từ Storage
    const storedRouteJson = localStorage.getItem('selectedRoute');
    if (!storedRouteJson) return alert("Lỗi: Không tìm thấy dữ liệu hành trình.");
    
    const storedRoute = JSON.parse(storedRouteJson);
    
    // Lấy điểm A và B của người dùng (để tính đường đi bộ)
    // Ưu tiên lấy từ waypoints nếu có, nếu không thì lấy start_place/end_place
    let userStart, userEnd;
    if (storedRoute.waypoints && storedRoute.waypoints.length >= 2) {
        userStart = storedRoute.waypoints[0];
        userEnd = storedRoute.waypoints[storedRoute.waypoints.length - 1];
    } else {
        userStart = storedRoute.start_place;
        userEnd = storedRoute.end_place;
    }

    // Hiển thị loading trên giá tiền
    const priceEl = document.querySelector('.option-card.selected .price');
    const originalText = priceEl ? priceEl.textContent : "";
    if (priceEl) priceEl.textContent = "⏳...";

    try {
        // 2. Gọi API Backend (đã sửa) để lấy tọa độ trạm
        const response = await fetch('/api/bus/find', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                start: { lat: parseFloat(userStart.lat), lon: parseFloat(userStart.lon || userStart.lng) },
                end: { lat: parseFloat(userEnd.lat), lon: parseFloat(userEnd.lon || userEnd.lng) }
            })
        });
        
        const res = await response.json();
        
        if (res.success) {
            // 3. Gọi hàm vẽ chi tiết
            drawDetailedBusRoute(res.data, userStart, userEnd);
        } else {
            alert("⚠️ " + (res.error || "Không tìm thấy lộ trình chi tiết"));
        }
    } catch (e) {
        console.error("❌ Lỗi:", e);
        alert("Lỗi kết nối: " + e.message);
    } finally {
        if (priceEl) priceEl.textContent = originalText;
    }
}

/**
 * Hàm vẽ 3 đoạn: Đi bộ -> Xe Buýt -> Đi bộ
 */
function drawDetailedBusRoute(busData, userStart, userEnd) {
    // Xóa layer cũ
    if (typeof routeLayerGroup !== 'undefined') {
        routeLayerGroup.clearLayers();
    }

    // Lấy dữ liệu từ Backend trả về
    const busCoords = busData.route_coordinates; // Đường xe chạy
    const stationStart = busData.station_start_coords; // Trạm đón
    const stationEnd = busData.station_end_coords;     // Trạm trả

    if (!busCoords || !stationStart || !stationEnd) {
        alert("Dữ liệu bản đồ bị thiếu, không thể vẽ chi tiết.");
        return;
    }

    // --- PHẦN A: VẼ MARKER ĐIỂM NGƯỜI DÙNG ---
    createCustomMarker(map, userStart.lat, userStart.lon || userStart.lng, '#4285f4', 'A', '<b>Vị trí của bạn</b>');
    createCustomMarker(map, userEnd.lat, userEnd.lon || userEnd.lng, '#ea4335', 'B', '<b>Điểm đến</b>');

    // --- PHẦN B: VẼ ĐƯỜNG ĐI BỘ (Nét đứt màu xám) ---
    // 1. Từ chỗ người dùng -> Trạm đón
    const walkToLine = [
        [userStart.lat, userStart.lon || userStart.lng],
        [stationStart.lat, stationStart.lng]
    ];
    L.polyline(walkToLine, { color: '#666', dashArray: '10, 10', weight: 4, opacity: 0.8 })
     .addTo(routeLayerGroup)
     .bindPopup(`Đi bộ ra trạm: <b>${busData.start_stop_name}</b>`);

    // 2. Từ trạm xuống -> Điểm đến
    const walkFromLine = [
        [stationEnd.lat, stationEnd.lng],
        [userEnd.lat, userEnd.lon || userEnd.lng]
    ];
    L.polyline(walkFromLine, { color: '#666', dashArray: '10, 10', weight: 4, opacity: 0.8 })
     .addTo(routeLayerGroup)
     .bindPopup("Đi bộ về điểm đến");

    // --- PHẦN C: VẼ ĐƯỜNG XE BUÝT (Nét liền nổi bật) ---
    // Vẽ viền trắng to bên dưới để tạo tương phản
    L.polyline(busCoords, { color: 'white', weight: 8 }).addTo(routeLayerGroup);
    // Vẽ đường chính màu Cam (đặc trưng xe buýt)
    const busPolyline = L.polyline(busCoords, { color: '#FF9800', weight: 5 })
        .addTo(routeLayerGroup)
        .bindPopup(`<b>${busData.mode_name}</b><br>Giá vé: ${busData.display_price}`);

    // --- PHẦN D: VẼ MARKER TRẠM XE BUÝT ---
    // Tạo Icon xe buýt nhỏ
    const busIcon = L.divIcon({ 
        html: '<div style="background:white; border-radius:50%; border:2px solid #FF9800; width:24px; height:24px; display:flex; align-items:center; justify-content:center; box-shadow:0 2px 4px rgba(0,0,0,0.3); font-size:14px;">🚌</div>', 
        className: 'bus-marker-custom', 
        iconSize: [28, 28],
        iconAnchor: [14, 14] 
    });

    L.marker([stationStart.lat, stationStart.lng], {icon: busIcon})
     .addTo(routeLayerGroup)
     .bindPopup(`<b>Trạm Đón</b><br>${busData.start_stop_name}`).openPopup();

    L.marker([stationEnd.lat, stationEnd.lng], {icon: busIcon})
     .addTo(routeLayerGroup)
     .bindPopup(`<b>Trạm Xuống</b><br>${busData.end_stop_name}`);

    // Zoom map bao quát toàn bộ hành trình
    const bounds = L.latLngBounds([
        [userStart.lat, userStart.lon || userStart.lng],
        [userEnd.lat, userEnd.lon || userEnd.lng]
    ]);
    map.fitBounds(bounds, { padding: [50, 50] });
}
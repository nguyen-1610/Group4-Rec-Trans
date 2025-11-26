// Các biến toàn cục
let map;
let currentPolyline;
let currentRoute;

document.addEventListener('DOMContentLoaded', function() {
    initializeMap();
    setupVehicleSelection();
});

// ==========================================
// KHỞI TẠO BẢN ĐỒ
// ==========================================

function initializeMap() {
    const storedRoute = getStoredRouteFromStorage();
    
    // Xác định vị trí khởi đầu
    const initialView = storedRoute && storedRoute.waypoints && storedRoute.waypoints[0]
        ? [storedRoute.waypoints[0].lat, storedRoute.waypoints[0].lon]
        : [10.7748, 106.6937]; // Default: TP.HCM
    
    // Khởi tạo bản đồ
    map = L.map('map', {
        center: initialView,
        zoom: 14,
        zoomControl: true
    });
    
    // Thêm tile layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19
    }).addTo(map);
    
    // Vẽ route nếu có
    if (storedRoute) {
        currentRoute = storedRoute;
        drawRouteOnMap(storedRoute);
        updateVehiclePanel(storedRoute);
    } else {
        console.warn('Không có route được lưu, hiển thị bản đồ trống');
    }
}

// ==========================================
// LẤY ROUTE TỪ LOCALSTORAGE
// ==========================================

function getStoredRouteFromStorage() {
    const raw = localStorage.getItem('selectedRoute');
    if (!raw) return null;

    try {
        const parsed = JSON.parse(raw);
        
        // Validate dữ liệu
        if (!parsed.route_coordinates || !parsed.waypoints) {
            console.warn('Dữ liệu route không hợp lệ');
            return null;
        }
        
        return parsed;
    } catch (error) {
        console.error('Lỗi parse route data:', error);
        return null;
    }
}

// ==========================================
// VẼ ROUTE LÊN BẢN ĐỒ
// ==========================================

function drawRouteOnMap(route) {
    // Xóa polyline cũ nếu có
    if (currentPolyline) {
        map.removeLayer(currentPolyline);
    }
    
    // Chuyển đổi coordinates từ [lon, lat] sang [lat, lon] cho Leaflet
    // OSRM trả về format GeoJSON: [lon, lat]
    const leafletCoords = route.route_coordinates.map(coord => {
        // Kiểm tra format
        if (Array.isArray(coord) && coord.length === 2) {
            return [coord[1], coord[0]]; // [lat, lon]
        }
        return coord;
    });
    
    // Tạo polyline
    currentPolyline = L.polyline(leafletCoords, {
        color: '#4285f4',
        weight: 6,
        opacity: 0.85,
        lineJoin: 'round',
        lineCap: 'round'
    }).addTo(map);
    
    // Fit bounds để hiển thị toàn bộ route
    map.fitBounds(currentPolyline.getBounds(), { 
        padding: [60, 60],
        maxZoom: 16
    });
    
    // Vẽ markers cho điểm đầu và điểm cuối
    const waypoints = route.waypoints;
    if (waypoints && waypoints.length >= 2) {
        const startPoint = waypoints[0];
        const endPoint = waypoints[waypoints.length - 1];
        
        createCustomMarker(
            startPoint.lat, 
            startPoint.lon, 
            '#4285f4', 
            'A', 
            startPoint.name || 'Điểm xuất phát'
        );
        
        createCustomMarker(
            endPoint.lat, 
            endPoint.lon, 
            '#ea4335', 
            'B', 
            endPoint.name || 'Điểm đến'
        );
        
        // Nếu có điểm trung gian (multi-destination)
        if (waypoints.length > 2) {
            for (let i = 1; i < waypoints.length - 1; i++) {
                const point = waypoints[i];
                createCustomMarker(
                    point.lat,
                    point.lon,
                    '#fbbc04',
                    (i + 1).toString(),
                    point.name || `Điểm ${i + 1}`
                );
            }
        }
    }
}

// ==========================================
// TẠO MARKER TÙY CHỈNH
// ==========================================

function createCustomMarker(lat, lon, color, label, popupText) {
    const icon = L.divIcon({
        html: `
            <div style="
                background: ${color};
                color: white;
                width: 36px;
                height: 36px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-weight: bold;
                font-size: 16px;
                border: 3px solid white;
                box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            ">
                ${label}
            </div>
        `,
        className: 'custom-marker',
        iconSize: [36, 36],
        iconAnchor: [18, 18],
        popupAnchor: [0, -20]
    });

    const marker = L.marker([lat, lon], { icon }).addTo(map);
    
    if (popupText) {
        marker.bindPopup(`<b>${popupText}</b>`);
    }
    
    return marker;
}

// ==========================================
// CẬP NHẬT THÔNG TIN PHƯƠNG TIỆN
// ==========================================

function updateVehiclePanel(route) {
    // Cập nhật thông tin cho tất cả vehicle cards
    const cards = document.querySelectorAll('.option-card');
    
    cards.forEach(card => {
        const vehicleType = card.dataset.vehicle;
        const timeElement = card.querySelector('.vehicle-info p');
        const priceElement = card.querySelector('.price');
        
        if (timeElement) {
            // Tính toán thời gian dựa trên loại phương tiện
            const duration = calculateDuration(route.distance_km, vehicleType);
            timeElement.textContent = `${duration} phút`;
        }
        
        if (priceElement) {
            // Tính toán giá dựa trên khoảng cách
            const price = calculatePrice(route.distance_km, vehicleType);
            priceElement.textContent = price === 0 ? 'Miễn phí' : `${price.toLocaleString('vi-VN')}đ`;
        }
    });
    
    // Chọn phương tiện mặc định (từ route hoặc mặc định)
    const defaultVehicle = route.vehicle?.type || 'motorbike';
    const defaultCard = document.querySelector(`.option-card[data-vehicle="${defaultVehicle}"]`) 
                        || document.querySelector('.option-card');
    
    if (defaultCard) {
        document.querySelectorAll('.option-card').forEach(c => c.classList.remove('selected'));
        defaultCard.classList.add('selected');
    }
}

// ==========================================
// TÍNH TOÁN THỜI GIAN VÀ GIÁ
// ==========================================

function calculateDuration(distanceKm, vehicleType) {
    const speedMap = {
        'walk': 4,        // 4 km/h
        'bike': 15,       // 15 km/h
        'motorbike': 30,  // 30 km/h
        'car': 35,        // 35 km/h (tính tắc đường)
        'bus': 25         // 25 km/h
    };
    
    const speed = speedMap[vehicleType] || 30;
    const hours = distanceKm / speed;
    return Math.round(hours * 60); // Chuyển sang phút
}

function calculatePrice(distanceKm, vehicleType) {
    const priceMap = {
        'walk': 0,
        'bike': 0,
        'motorbike': 5000 + (distanceKm * 3000),    // 5k + 3k/km
        'car': 10000 + (distanceKm * 8000),         // 10k + 8k/km
        'bus': 7000                                  // Cố định 7k
    };
    
    return Math.round(priceMap[vehicleType] || 0);
}

// ==========================================
// CHỌN PHƯƠNG TIỆN
// ==========================================

function setupVehicleSelection() {
    const optionCards = document.querySelectorAll('.option-card');
    
    optionCards.forEach(card => {
        card.addEventListener('click', function() {
            // Bỏ selected cũ
            optionCards.forEach(c => c.classList.remove('selected'));
            
            // Thêm selected mới
            this.classList.add('selected');
            
            const vehicleType = this.dataset.vehicle;
            console.log(`Đã chọn phương tiện: ${vehicleType}`);
            
            // Cập nhật route với phương tiện mới (nếu cần)
            if (currentRoute) {
                currentRoute.vehicle = {
                    type: vehicleType,
                    name: this.querySelector('h4').textContent
                };
                
                // Lưu lại localStorage
                localStorage.setItem('selectedRoute', JSON.stringify(currentRoute));
            }
        });
    });
}

// ==========================================
// TẢI LẠI ROUTE TỪ SERVER (NẾU CẦN)
// ==========================================

async function reloadRouteWithVehicle(vehicleType) {
    if (!currentRoute || !currentRoute.start_place || !currentRoute.end_place) {
        console.warn('Không có thông tin route để reload');
        return;
    }
    
    try {
        const vehicleSpeedMap = {
            'walk': 4,
            'bike': 15,
            'motorbike': 30,
            'car': 35,
            'bus': 25
        };
        
        const response = await fetch(`${window.location.origin}/api/find-route-osm`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                start: {
                    lat: currentRoute.start_place.lat,
                    lon: currentRoute.start_place.lon,
                    name: currentRoute.start_place.name
                },
                end: {
                    lat: currentRoute.end_place.lat,
                    lon: currentRoute.end_place.lon,
                    name: currentRoute.end_place.name
                },
                vehicle_type: vehicleType,
                vehicle_speed: vehicleSpeedMap[vehicleType] || 30
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            const newRoute = {
                ...currentRoute,
                route_coordinates: result.data.route_coordinates,
                distance_km: result.data.distance_km,
                duration_min: result.data.duration_min,
                vehicle: { type: vehicleType }
            };
            
            currentRoute = newRoute;
            localStorage.setItem('selectedRoute', JSON.stringify(newRoute));
            
            // Vẽ lại route
            drawRouteOnMap(newRoute);
            updateVehiclePanel(newRoute);
        }
        
    } catch (error) {
        console.error('Lỗi khi reload route:', error);
    }
}

// ==========================================
// XỬ LÝ CÁC NÚT BẤM
// ==========================================

function goToPreviousPage() {
    window.history.back();
}

function switchTab(evt, tabName) {
    const tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach(btn => btn.classList.remove('active'));
    
    if (evt && evt.target) {
        evt.target.classList.add('active');
    }

    if (tabName === 'ai') {
        window.location.href = '/chatbot';
    } else if (tabName === 'map') {
        window.location.href = '/map_trans';
    }
}

function goBack() {
    // Quay về form hoặc mở chatbot
    window.location.href = '/chatbot';
}

function confirmRoute() {
    const selectedCard = document.querySelector('.option-card.selected');
    
    if (!selectedCard) {
        alert('Vui lòng chọn một phương tiện!');
        return;
    }
    
    const vehicleName = selectedCard.querySelector('h4').textContent;
    const price = selectedCard.querySelector('.price').textContent;
    const time = selectedCard.querySelector('.vehicle-info p').textContent;
    
    // Lưu lựa chọn cuối cùng
    if (currentRoute) {
        currentRoute.confirmed = true;
        currentRoute.selected_vehicle = {
            type: selectedCard.dataset.vehicle,
            name: vehicleName,
            price: price,
            time: time
        };
        
        localStorage.setItem('selectedRoute', JSON.stringify(currentRoute));
    }
    
    // Chuyển sang trang tiếp theo (chatbot hoặc summary)
    alert(`XÁC NHẬN:\n- Phương tiện: ${vehicleName}\n- Thời gian: ${time}\n- Chi phí: ${price}`);
    
    // Uncomment để chuyển trang
    // window.location.href = '/chatbot';
}

// ==========================================
// EXPORT HÀM ĐỂ HTML SỬ DỤNG
// ==========================================

window.goToPreviousPage = goToPreviousPage;
window.switchTab = switchTab;
window.goBack = goBack;
window.confirmRoute = confirmRoute;
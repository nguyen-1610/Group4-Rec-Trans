document.addEventListener('DOMContentLoaded', function() {
    const FALLBACK_ROUTE = {
        start: { lat: 10.7748, lng: 106.6937, name: 'Công viên Tao Đàn' },
        end: { lat: 10.7626, lng: 106.6964, name: 'NYNA Coffee' }
    };

    const storedRoute = getStoredRouteFromStorage();
    const initialView = storedRoute
        ? [storedRoute.waypoints[0].lat, storedRoute.waypoints[0].lon]
        : [FALLBACK_ROUTE.start.lat, FALLBACK_ROUTE.start.lng];

    const map = L.map('map').setView(initialView, 14);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19
    }).addTo(map);

    if (storedRoute) {
        drawPolylineRoute(map, storedRoute);
        updateVehiclePanel(storedRoute);
    } else {
        drawFallbackRoute(map, FALLBACK_ROUTE);
    }

    setupVehicleSelection();
});

function getStoredRouteFromStorage() {
    const raw = localStorage.getItem('selectedRoute');
    if (!raw) return null;

    try {
        const parsed = JSON.parse(raw);
        if (!parsed.route_coordinates || !parsed.waypoints) {
            return null;
        }
        return parsed;
    } catch (error) {
        console.warn('Không thể parse dữ liệu lộ trình:', error);
        return null;
    }
}

function drawPolylineRoute(map, route) {
    const leafletCoords = route.route_coordinates.map(coord => [coord[1], coord[0]]);
    
    const polyline = L.polyline(leafletCoords, {
        color: '#4285f4',
        weight: 6,
        opacity: 0.85,
        lineJoin: 'round'
    }).addTo(map);
    
    map.fitBounds(polyline.getBounds(), { padding: [60, 60] });
    
    const startPlace = route.waypoints[0];
    const endPlace = route.waypoints[route.waypoints.length - 1];
    
    createCustomMarker(map, startPlace.lat, startPlace.lon, '#4285f4', 'A', startPlace.name);
    createCustomMarker(map, endPlace.lat, endPlace.lon, '#ea4335', 'B', endPlace.name);
}

function drawFallbackRoute(map, fallback) {
    L.Routing.control({
        waypoints: [
            L.latLng(fallback.start.lat, fallback.start.lng),
            L.latLng(fallback.end.lat, fallback.end.lng)
        ],
        routeWhileDragging: false,
        addWaypoints: false,
        draggableWaypoints: false,
        fitSelectedRoutes: true,
        lineOptions: {
            styles: [{ color: '#4285f4', weight: 6, opacity: 0.8 }]
        },
        createMarker: function() { return null; }
    }).addTo(map);

    createCustomMarker(map, fallback.start.lat, fallback.start.lng, '#4285f4', 'A', fallback.start.name);
    createCustomMarker(map, fallback.end.lat, fallback.end.lng, '#ea4335', 'B', fallback.end.name);
}

function createCustomMarker(map, lat, lng, color, label, popupLabel) {
    const icon = L.divIcon({
        html: `<div style="background:${color};color:white;width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:bold;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);">${label || ''}</div>`,
        className: 'custom-marker',
        iconSize: [32, 32],
        iconAnchor: [16, 16]
    });

    L.marker([lat, lng], { icon })
        .bindPopup(popupLabel || '')
        .addTo(map);
}

function updateVehiclePanel(route) {
    const selectedCard = document.querySelector('.option-card.selected') || document.querySelector('.option-card');
    if (!selectedCard) return;
    
    selectedCard.classList.add('selected');
    
    const title = selectedCard.querySelector('.vehicle-info h4');
    const time = selectedCard.querySelector('.vehicle-info p');
    const price = selectedCard.querySelector('.price');
    
    if (title && route.vehicle?.name) {
        title.textContent = route.vehicle.name;
    }
    if (time) {
        time.textContent = `${route.duration_min} phút (~${route.distance_km} km)`;
    }
    if (price) {
        price.textContent = `${route.distance_km} km`;
    }
}

function setupVehicleSelection() {
    const optionCards = document.querySelectorAll('.option-card');
    
    optionCards.forEach(card => {
        card.addEventListener('click', function() {
            optionCards.forEach(c => c.classList.remove('selected'));
            this.classList.add('selected');
            
            const vehicleType = this.dataset.vehicle;
            const price = this.dataset.price;
            console.log(`Đã chọn phương tiện: ${vehicleType} - Giá: ${price}`);
        });
    });
}

// ================================================================
// 5. CÁC HÀM XỬ LÝ NÚT BẤM (BUTTON FUNCTIONS)
// Phải để ngoài cùng để HTML gọi được (onclick="...")
// ================================================================

function goToPreviousPage() {
    console.log("Back button clicked");
    // Code quay lại trang trước
    window.history.back();
}

function switchTab(tabName) {
    const tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach(btn => btn.classList.remove('active'));
    
    // Tìm nút nào đang gọi hàm này và active nó (đơn giản hóa)
    if(event && event.target) {
        event.target.classList.add('active');
    }

    if (tabName === 'ai') {
        alert("Chuyển sang màn hình AI Chatbot...");
        // window.location.href = '/ai-chat'; // Ví dụ đường dẫn
    }
}

function goBack() {
    alert("Mở tính năng Tư Vấn...");
}

function confirmRoute() {
    // Tìm thẻ xe đang được chọn
    const selectedCard = document.querySelector('.option-card.selected');
    
    if (selectedCard) {
        const vehicleName = selectedCard.querySelector('h4').innerText;
        const price = selectedCard.querySelector('.price').innerText;
        const time = selectedCard.querySelector('.vehicle-info p').innerText;
        
        alert(`XÁC NHẬN:\n- Phương tiện: ${vehicleName}\n- Thời gian: ${time}\n- Chi phí: ${price}`);
    } else {
        alert("Vui lòng chọn một phương tiện!");
    }
}

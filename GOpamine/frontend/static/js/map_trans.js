// === NHẬN DỮ LIỆU TỪ PAGE TRƯỚC ===
// Giả lập dữ liệu - trong thực tế bạn sẽ nhận từ localStorage hoặc URL params
const routeData = {
    start: { lat: 10.7880, lng: 106.7025, name: "Công viên Tao Đàn" },
    end: { lat: 10.7626, lng: 106.6964, name: "NYNA Coffee" },
    // Dữ liệu phương tiện từ database
    vehicles: [
        { type: "motorbike", name: "Xe máy", icon: "🏍️", time: "9 phút", price: 15000, stars: 3 },
        { type: "car", name: "Ô tô điện", icon: "🚗", time: "9 phút", price: 30000, stars: 3 },
        { type: "bus", name: "Xe buýt", icon: "🚌", time: "15 phút", price: 7000, stars: 3 },
        { type: "walk", name: "Đi bộ", icon: "🚶", time: "25 phút", price: 0, stars: 0 }
    ]
};

// Khởi tạo bản đồ
const map = L.map('map').setView([routeData.start.lat, routeData.start.lng], 14);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap',
    maxZoom: 19
}).addTo(map);

// Tạo custom icons
const startIcon = L.divIcon({
    html: '<div style="background: #4285f4; width: 16px; height: 16px; border-radius: 50%; border: 4px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.3);"></div>',
    iconSize: [24, 24],
    iconAnchor: [12, 12]
});

const endIcon = L.divIcon({
    html: '<div style="background: #ea4335; width: 16px; height: 16px; border-radius: 50%; border: 4px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.3);"></div>',
    iconSize: [24, 24],
    iconAnchor: [12, 12]
});

// Thêm markers - XÓA ĐI ĐỂ KHÔNG HIỆN 2 CHẤM
// L.marker([routeData.start.lat, routeData.start.lng], { icon: startIcon }).addTo(map);
// L.marker([routeData.end.lat, routeData.end.lng], { icon: endIcon }).addTo(map);

// Vẽ tuyến đường
const routingControl = L.Routing.control({
    waypoints: [
        L.latLng(routeData.start.lat, routeData.start.lng),
        L.latLng(routeData.end.lat, routeData.end.lng)
    ],
    routeWhileDragging: false,
    addWaypoints: false,
    lineOptions: {
        styles: [{ color: '#4285f4', weight: 6, opacity: 0.8 }]
    },
    createMarker: function() { return null; }
}).addTo(map);

// Fit map
map.fitBounds([
    [routeData.start.lat, routeData.start.lng],
    [routeData.end.lat, routeData.end.lng]
], { padding: [100, 100] });

// === XỬ LÝ CHỌN PHƯƠNG TIỆN ===
let selectedVehicle = 'motorbike';

document.querySelectorAll('.option-card').forEach(card => {
    card.addEventListener('click', function() {
        // Bỏ chọn tất cả
        document.querySelectorAll('.option-card').forEach(c => c.classList.remove('selected'));
        
        // Chọn card hiện tại
        this.classList.add('selected');
        selectedVehicle = this.dataset.vehicle;
        
        // Cập nhật thông tin trên map
        const price = this.dataset.price;
        const time = this.querySelector('.vehicle-info p').textContent;
        
        // Chú ý: 2 dòng dưới sẽ báo lỗi vì bạn đã xóa
        // 2 thẻ 'routeTime' và 'routeDistance' trong HTML mới
        
        // document.getElementById('routeTime').textContent = time;
        // document.getElementById('routeDistance').textContent = 
        //     price === '0' ? 'Miễn phí' : parseInt(price).toLocaleString('vi-VN') + 'đ';
    });
});

// === HÀM XỬ LÝ BUTTONS ===
function goToPreviousPage() {
    alert('Quay về trang trước');
    // Trong thực tế: window.history.back(); hoặc window.location.href = '/previous-page';
}

function switchTab(tab) {
    const tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach(btn => btn.classList.remove('active'));
    
    if (tab === 'map') {
        tabs[0].classList.add('active');
        // Hiển thị bản đồ (đang hiển thị rồi)
    } else if (tab === 'ai') {
        tabs[1].classList.add('active');
        alert('Chuyển sang chế độ AI Chat Bot');
        // Trong thực tế: window.location.href = '/ai-chat';
        // Hoặc load component AI chat vào trang này
    }
}

function goBack() {
    alert('Chức năng Tư Vấn - Sẽ mở chat hoặc hotline hỗ trợ');
    // Trong thực tế: window.location.href = '/consultation';
}

function confirmRoute() {
    const selectedCard = document.querySelector('.option-card.selected');
    const vehicleType = selectedCard.dataset.vehicle;
    const price = selectedCard.dataset.price;
    const time = selectedCard.querySelector('.vehicle-info p').textContent;
    
    alert(`Đã chọn: ${selectedCard.querySelector('h4').textContent}\nThời gian: ${time}\nGiá: ${parseInt(price).toLocaleString('vi-VN')}đ`);
    
    // Trong thực tế bạn sẽ gửi dữ liệu này đi:
    // - Lưu vào database
    // - Chuyển sang trang xác nhận đặt xe
    // window.location.href = `/booking?vehicle=${vehicleType}&price=${price}`;
}

// === RENDER DỮ LIỆU TỪ DATABASE ===
// Hàm này để render động các option từ data
function renderVehicleOptions(vehicles) {
    const container = document.querySelector('.vehicle-options');
    const existingCards = container.querySelector('.option-card');
    
    // Code để render động - hiện tại đã có sẵn trong HTML
    // Trong thực tế bạn sẽ fetch từ API và render
}

// === LƯU DỮ LIỆU ===
// Ví dụ lấy dữ liệu từ page trước qua localStorage
function loadRouteFromPreviousPage() {
    // const saved = localStorage.getItem('routeData');
    // if (saved) {
    //     const data = JSON.parse(saved);
    //     // Cập nhật map với data
    // }
}

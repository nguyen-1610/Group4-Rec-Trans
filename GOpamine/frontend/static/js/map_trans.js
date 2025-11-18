// ================================================================
// 🔑 CẤU HÌNH API KEY (DÀNH CHO LEADER)
// ================================================================
// Hiện tại đang dùng OpenStreetMap (Miễn phí) nên chưa cần Key.
// Nếu sau này đổi sang MapTiler/Goong, hãy điền Key vào đây:
const API_KEY = "YOUR_API_KEY_HERE"; 
// ================================================================

// === DỮ LIỆU MẪU ===
const routeData = {
    start: { lat: 10.7880, lng: 106.7025, name: "Công viên Tao Đàn" },
    end: { lat: 10.7626, lng: 106.6964, name: "NYNA Coffee" }
};

// === KHỞI TẠO BẢN ĐỒ ===
const map = L.map('map').setView([routeData.start.lat, routeData.start.lng], 14);

// Dùng OpenStreetMap (Miễn phí)
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap',
    maxZoom: 19
}).addTo(map);

// === VẼ TUYẾN ĐƯỜNG ===
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

// Fit khung nhìn
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
        
        // Cập nhật UI nếu cần
        const price = this.dataset.price;
        const time = this.querySelector('.vehicle-info p').textContent;
        console.log(`Đã chọn: ${selectedVehicle}, Giá: ${price}`);
    });
});

// === HÀM XỬ LÝ BUTTONS ===
function goToPreviousPage() {
    alert('Quay về trang trước');
}

function switchTab(tab) {
    const tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach(btn => btn.classList.remove('active'));
    
    if (tab === 'map') {
        tabs[0].classList.add('active');
    } else if (tab === 'ai') {
        tabs[1].classList.add('active');
        alert('Chuyển sang chế độ AI Chat Bot');
    }
}

function goBack() {
    alert('Chức năng Tư Vấn - Sẽ mở chat hoặc hotline hỗ trợ');
}

function confirmRoute() {
    const selectedCard = document.querySelector('.option-card.selected');
    const vehicleType = selectedCard.dataset.vehicle;
    const price = selectedCard.dataset.price;
    const vehicleName = selectedCard.querySelector('h4').textContent;
    
    alert(`Xác nhận chọn: ${vehicleName}\nGiá: ${parseInt(price).toLocaleString('vi-VN')}đ`);
}

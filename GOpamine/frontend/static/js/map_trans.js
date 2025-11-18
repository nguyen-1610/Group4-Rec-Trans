document.addEventListener('DOMContentLoaded', function() {
    // ================================================================
    // 1. CẤU HÌNH DỮ LIỆU (DATA)
    // ================================================================
    const routeData = {
        // Tọa độ điểm đi (Công viên Tao Đàn)
        start: { lat: 10.7748, lng: 106.6937 }, 
        // Tọa độ điểm đến (NYNA Coffee - giả lập)
        end: { lat: 10.7626, lng: 106.6964 }
    };

    // ================================================================
    // 2. KHỞI TẠO BẢN ĐỒ (DÙNG OPENSTREETMAP - MIỄN PHÍ 100%)
    // ================================================================
    const map = L.map('map').setView([routeData.start.lat, routeData.start.lng], 14);

    // Đây là link server của OpenStreetMap, không cần API Key
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19
    }).addTo(map);

    // ================================================================
    // 3. VẼ TUYẾN ĐƯỜNG (ROUTING)
    // ================================================================
    L.Routing.control({
        waypoints: [
            L.latLng(routeData.start.lat, routeData.start.lng),
            L.latLng(routeData.end.lat, routeData.end.lng)
        ],
        routeWhileDragging: false, // Tắt tính năng kéo đường để sửa
        addWaypoints: false,       // Không cho thêm điểm giữa
        draggableWaypoints: false, // Không cho di chuyển điểm đầu/cuối
        fitSelectedRoutes: true,   // Tự động zoom để thấy toàn bộ đường đi
        lineOptions: {
            styles: [{ color: '#4285f4', weight: 6, opacity: 0.8 }] // Màu xanh Google Maps
        },
        createMarker: function() { return null; } // Ẩn marker mặc định của thư viện routing
    }).addTo(map);

    // Tạo Marker đẹp cho điểm đi và đến (Tùy chọn - nếu muốn hiện icon tròn)
    const createCustomMarker = (lat, lng, color) => {
        const icon = L.divIcon({
            html: `<div style="background: ${color}; width: 16px; height: 16px; border-radius: 50%; border: 4px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.3);"></div>`,
            className: 'custom-marker',
            iconSize: [24, 24],
            iconAnchor: [12, 12]
        });
        L.marker([lat, lng], { icon: icon }).addTo(map);
    };

    createCustomMarker(routeData.start.lat, routeData.start.lng, '#4285f4'); // Điểm đi: Xanh
    createCustomMarker(routeData.end.lat, routeData.end.lng, '#ea4335');   // Điểm đến: Đỏ

    // ================================================================
    // 4. XỬ LÝ SỰ KIỆN CHỌN PHƯƠNG TIỆN
    // ================================================================
    const optionCards = document.querySelectorAll('.option-card');
    
    optionCards.forEach(card => {
        card.addEventListener('click', function() {
            // Xóa class 'selected' ở tất cả các thẻ cũ
            optionCards.forEach(c => c.classList.remove('selected'));
            
            // Thêm class 'selected' cho thẻ vừa bấm
            this.classList.add('selected');
            
            // Lấy dữ liệu từ thẻ vừa bấm (để xử lý sau này)
            const vehicleType = this.dataset.vehicle;
            const price = this.dataset.price;
            console.log(`Đã chọn phương tiện: ${vehicleType} - Giá: ${price}`);
        });
    });
});

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

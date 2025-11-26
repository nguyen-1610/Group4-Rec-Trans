/**
 * 🚌 GOPamine - Map & Transport Logic
 * ==========================================
 * Quản lý bản đồ, gọi API tính giá tiền, hiển thị danh sách xe và xử lý sự kiện.
 */

document.addEventListener('DOMContentLoaded', async function() {
    
    // =========================================================================
    // 1. CONFIGURATION & CONSTANTS
    // =========================================================================
    
    const TRAFFIC_CONFIG = {
        rush_hours: [[7, 9], [16.5, 19]], // Giờ cao điểm
        speeds: {
            motorbike: { rush: 25, normal: 35 },
            car:       { rush: 15, normal: 35 },
            bus:       { rush: 12, normal: 20 },
            walk:      { rush: 4,  normal: 5 }
        }
    };

    const FALLBACK_ROUTE = {
        start: { lat: 10.7748, lng: 106.6937, name: 'Tao Đàn' },
        end:   { lat: 10.7626, lng: 106.6964, name: 'NYNA Coffee' },
        distance_km: 2.5
    };

    // Lấy dữ liệu lộ trình từ localStorage (được lưu từ trang Form)
    const storedRoute = getStoredRouteFromStorage();
    
    // Chuẩn bị dữ liệu khởi tạo Map
    const mapStart   = storedRoute ? storedRoute.waypoints[0] : FALLBACK_ROUTE.start;
    const mapEnd     = storedRoute ? storedRoute.waypoints[storedRoute.waypoints.length-1] : FALLBACK_ROUTE.end;
    const distanceKm = storedRoute ? storedRoute.distance_km : FALLBACK_ROUTE.distance_km;

    console.log(`📍 [Map] Khởi tạo với khoảng cách: ${distanceKm}km`);

    // =========================================================================
    // 2. MAP INITIALIZATION (LeafletJS)
    // =========================================================================

    // Khởi tạo bản đồ, tắt zoom mặc định để tự custom vị trí
    const map = L.map('map', {
        zoomControl: false,
        center: [mapStart.lat, mapStart.lon || mapStart.lng],
        zoom: 14
    });

    // Thêm lớp bản đồ nền (OpenStreetMap)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors', 
        maxZoom: 19
    }).addTo(map);

    // Thêm nút Zoom ở góc dưới phải (UI/UX)
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // Vẽ đường đi (Polyline) và Markers
    if (storedRoute) drawPolylineRoute(map, storedRoute);
    createCustomMarker(map, mapStart.lat, mapStart.lon || mapStart.lng, '#4285f4', 'A', mapStart.name);
    createCustomMarker(map, mapEnd.lat, mapEnd.lon || mapEnd.lng, '#ea4335', 'B', mapEnd.name);

    // =========================================================================
    // 3. DATA FETCHING & UI UPDATE
    // =========================================================================

    // Bước 1: Hiển thị trạng thái "Đang tính..." cho các thẻ mặc định
    updateAllVehicleCardsDefault();

    // Bước 2: Gọi API Backend để lấy giá tiền và danh sách xe thực tế
    await fetchAndRenderTransportOptions(distanceKm);

    // Bước 3: Kích hoạt sự kiện click cho các thẻ xe (cả cũ và mới)
    setupCardSelectionEvents();
    
    // Bước 4: Tự động chọn xe đã chọn trước đó (nếu có)
    if (storedRoute && storedRoute.vehicle) {
        const card = document.querySelector(`.option-card[data-vehicle="${storedRoute.vehicle.type}"]`);
        if (card) card.click();
    }

    // =========================================================================
    // 4. CORE FUNCTIONS
    // =========================================================================

    /**
     * Gọi API tính toán giá tiền từ Backend
     */
    async function fetchAndRenderTransportOptions(distanceKm) {
        try {
            // Lấy sở thích người dùng để Backend gợi ý tốt hơn
            let priorities = ['saving', 'speed'];
            try {
                const formData = JSON.parse(localStorage.getItem('formData'));
                if (formData?.preferences) {
                    priorities = formData.preferences.map(p => 
                        p.toLowerCase().includes('tiết') ? 'saving' :
                        p.toLowerCase().includes('nhanh') ? 'speed' :
                        p.toLowerCase().includes('an') ? 'safety' : 'comfort'
                    );
                }
            } catch (e) { console.warn("⚠️ Dùng priority mặc định."); }

            console.log(`📡 [API] Gọi compare-transport...`);

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
                console.log("✅ [API] Dữ liệu nhận được:", result.data);
                renderDynamicCards(result.data, distanceKm);
            } else {
                console.error("❌ [API] Lỗi hoặc không có dữ liệu:", result);
            }
        } catch (error) {
            console.error("❌ [API] Lỗi kết nối:", error);
        }
    }

    /**
     * Render lại toàn bộ danh sách thẻ xe dựa trên dữ liệu Backend (Dynamic Rendering)
     */
    function renderDynamicCards(backendResults, distanceKm) {
        const container = document.querySelector('.vehicle-scroll-container');
        
        // 1. Xóa nội dung cũ (các thẻ Loading...)
        container.innerHTML = '';

        // 2. Helper chọn icon
        const getIcon = (name) => {
            const n = name.toLowerCase();
            if (n.includes('grab')) return '🟢'; 
            if (n.includes('be')) return '🟡';   
            if (n.includes('gojek')) return '🔴'; 
            if (n.includes('xanh')) return '🚙';  
            if (n.includes('buýt') || n.includes('bus')) return '🚌';
            if (n.includes('bộ') || n.includes('walk')) return '🚶';
            if (n.includes('máy') || n.includes('bike')) return '🏍️';
            return '🚗';
        };

        // 3. Tạo và chèn thẻ HTML mới
        backendResults.forEach(item => {
            const icon = getIcon(item.mode_name);
            // Màu điểm số: Xanh lá (Cao) -> Cam (Trung bình) -> Đỏ (Thấp)
            const scoreColor = item.score >= 8.5 ? '#4caf50' : (item.score >= 6 ? '#ff9800' : '#f44336');
            
            // Tạo HTML Tags (Nhãn)
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

        // 4. Setup lại sự kiện click cho các thẻ mới
        setupCardSelectionEvents();
        
        // 5. Tự động chọn thẻ đầu tiên (Gợi ý tốt nhất)
        const firstCard = container.querySelector('.option-card');
        if(firstCard) firstCard.classList.add('selected');
    }

    // =========================================================================
    // 5. HELPER FUNCTIONS
    // =========================================================================

    function updateAllVehicleCardsDefault() {
        ['motorbike', 'car', 'bus', 'walk'].forEach(type => {
            const card = document.querySelector(`.option-card[data-vehicle="${type}"]`);
            if (card) {
                card.querySelector('.price').textContent = "Đang tính...";
                if (estimateSpeed(type) === 0) card.classList.add("disabled-card");
            }
        });
    }

    function estimateSpeed(type) {
        const h = new Date().getHours();
        const cfg = TRAFFIC_CONFIG.speeds[type];
        if (type === 'bus' && (h >= 21 || h < 5)) return 0;
        
        const isRush = TRAFFIC_CONFIG.rush_hours.some(([s, e]) => h >= s && h < e);
        return isRush ? cfg.rush : cfg.normal;
    }

    function getStoredRouteFromStorage() {
        try { return JSON.parse(localStorage.getItem('selectedRoute')); } catch { return null; }
    }

    function drawPolylineRoute(map, route) {
        if (!route.route_coordinates) return;
        const latlngs = route.route_coordinates.map(c => [c[1], c[0]]);
        const polyline = L.polyline(latlngs, { color: '#4285f4', weight: 6 }).addTo(map);
        map.fitBounds(polyline.getBounds(), { padding: [50, 50] });
    }

    function createCustomMarker(map, lat, lng, color, label, popup) {
        const icon = L.divIcon({
            html: `<div style="background:${color}; color:white; width:30px; height:30px; border-radius:50%; display:flex; align-items:center; justify-content:center; border:2px solid white; box-shadow:0 2px 5px rgba(0,0,0,0.3); font-weight:bold;">${label}</div>`,
            className: '', iconSize: [30, 30], iconAnchor: [15, 15]
        });
        L.marker([lat, lng], { icon }).addTo(map).bindPopup(popup);
    }

    function setupCardSelectionEvents() {
        document.querySelectorAll('.option-card').forEach(card => {
            card.addEventListener('click', function() {
                if (this.classList.contains('disabled-card')) {
                    alert("Phương tiện này hiện không hoạt động!"); return;
                }
                document.querySelectorAll('.option-card').forEach(c => c.classList.remove('selected'));
                this.classList.add('selected');
            });
        });
    }
});

// =============================================================================
// 6. GLOBAL FUNCTIONS (EXPOSED TO HTML)
// =============================================================================

/**
 * Chuyển tab giữa Map và AI
 */
window.switchTab = function(arg1, arg2) {
    const tabName = (typeof arg1 === 'string') ? arg1 : arg2;
    console.log("🖱️ Chuyển tab:", tabName);

    if (tabName === 'ai' || tabName === 'chatbot') {
        window.location.href = '/chatbot';
    }
};

/**
 * Nút "Chọn" phương tiện -> Chốt đơn -> Sang Chatbot
 */
window.confirmRoute = function() {
    const card = document.querySelector('.option-card.selected');
    if (!card) return alert("Vui lòng chọn một phương tiện!");
    
    const choice = {
        type: card.dataset.vehicle,
        price: card.dataset.price,
        time: card.dataset.time,
        score: card.dataset.score
    };
    localStorage.setItem('finalChoice', JSON.stringify(choice));
    
    const msg = `✅ XÁC NHẬN LỘ TRÌNH:\n\n- Phương tiện: ${choice.type}\n- Giá dự kiến: ${choice.price}\n- Thời gian: ${choice.time}\n\nBạn muốn chốt đơn và gặp Trợ lý ảo ngay?`;
    if(confirm(msg)) window.location.href = '/chatbot';
};

window.goToPreviousPage = () => window.location.href = '/form';
window.goBack = () => window.location.href = '/chatbot';
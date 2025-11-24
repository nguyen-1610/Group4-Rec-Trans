/**
 * MapManager - Quản lý bản đồ và markers cho trang map_test.html
 * Sử dụng Leaflet để hiển thị địa điểm du lịch
 */
class MapManager {
    constructor(mapId) {
        this.mapId = mapId;
        this.map = null;
        this.markers = []; // Mảng lưu tất cả markers để có thể xóa
        this.markerGroup = null; // LayerGroup để quản lý markers
    }

    /**
     * Khởi tạo bản đồ Leaflet
     * Tọa độ mặc định: Sài Gòn (10.8231, 106.6297)
     */
    init() {
        // Kiểm tra xem Leaflet đã được load chưa
        if (typeof L === 'undefined') {
            console.error('Leaflet chưa được load!');
            return;
        }

        // Khởi tạo map với tọa độ trung tâm Sài Gòn
        this.map = L.map(this.mapId).setView([10.8231, 106.6297], 12);

        // Thêm tile layer (OpenStreetMap - miễn phí)
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 19
        }).addTo(this.map);

        // Tạo layer group để quản lý markers
        this.markerGroup = L.layerGroup().addTo(this.map);
    }

    /**
     * Tạo icon marker tùy chỉnh
     * @param {string} color - Màu của marker
     * @returns {L.DivIcon} - Leaflet DivIcon
     */
    createMarkerIcon(color = '#667eea') {
        return L.divIcon({
            className: 'custom-marker',
            html: `<div style="
                background: ${color}; 
                width: 30px; 
                height: 30px; 
                border-radius: 50% 50% 50% 0; 
                transform: rotate(-45deg); 
                border: 3px solid white; 
                box-shadow: 0 2px 5px rgba(0,0,0,0.3);
            "></div>`,
            iconSize: [30, 30],
            iconAnchor: [15, 30]
        });
    }

    /**
     * Tạo popup content cho marker
     * @param {Object} place - Đối tượng địa điểm
     * @returns {string} - HTML content cho popup
     */
    createPopupContent(place) {
        let html = `<div style="min-width: 200px;">`;
        html += `<h3 style="margin: 0 0 8px 0; font-size: 16px; color: #333;">${this.escapeHtml(place.name || 'Không có tên')}</h3>`;
        
        if (place.address) {
            html += `<p style="margin: 4px 0; font-size: 13px; color: #666;"><strong>📍 Địa chỉ:</strong> ${this.escapeHtml(place.address)}</p>`;
        }
        
        if (place.description) {
            const desc = place.description.length > 100 
                ? place.description.substring(0, 100) + '...' 
                : place.description;
            html += `<p style="margin: 4px 0; font-size: 12px; color: #777;">${this.escapeHtml(desc)}</p>`;
        }
        
        if (place.issue_unit) {
            html += `<p style="margin: 4px 0; font-size: 12px; color: #999;"><em>Đơn vị: ${this.escapeHtml(place.issue_unit)}</em></p>`;
        }
        
        html += `</div>`;
        return html;
    }

    /**
     * Escape HTML để tránh XSS
     * @param {string} text - Text cần escape
     * @returns {string} - Text đã escape
     */
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Xóa tất cả markers hiện tại
     */
    clearMarkers() {
        if (this.markerGroup) {
            this.markerGroup.clearLayers();
        }
        this.markers = [];
    }

    /**
     * Vẽ markers từ danh sách địa điểm
     * @param {Array} places - Mảng các địa điểm
     */
    drawMarkers(places) {
        // Xóa markers cũ
        this.clearMarkers();

        if (!places || places.length === 0) {
            console.log('Không có địa điểm nào để hiển thị');
            return;
        }

        // Màu sắc cho các loại địa điểm khác nhau
        const colorMap = {
            'Danh lam': '#e74c3c',
            'Vui chơi': '#3498db',
            'Ẩm thực': '#f39c12',
            'Văn hóa': '#9b59b6',
            'Mua sắm': '#1abc9c',
            'default': '#667eea'
        };

        // Vẽ từng marker
        places.forEach(place => {
            // Kiểm tra tọa độ hợp lệ
            if (!place.latitude || !place.longitude) {
                console.warn(`Địa điểm "${place.name}" không có tọa độ hợp lệ`);
                return;
            }

            const lat = parseFloat(place.latitude);
            const lng = parseFloat(place.longitude);

            // Kiểm tra tọa độ trong phạm vi hợp lệ
            if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
                console.warn(`Tọa độ không hợp lệ cho "${place.name}": ${lat}, ${lng}`);
                return;
            }

            // Chọn màu dựa trên issue_unit hoặc loại
            const color = colorMap[place.issue_unit] || colorMap['default'];

            // Tạo marker
            const marker = L.marker([lat, lng], {
                icon: this.createMarkerIcon(color)
            });

            // Thêm popup
            marker.bindPopup(this.createPopupContent(place), {
                maxWidth: 300,
                className: 'custom-popup'
            });

            // Thêm vào map
            marker.addTo(this.markerGroup);
            this.markers.push(marker);
        });

        // Tự động fit bounds để hiển thị tất cả markers
        if (this.markers.length > 0) {
            const group = new L.featureGroup(this.markers);
            this.map.fitBounds(group.getBounds().pad(0.1));
        }

        console.log(`Đã vẽ ${this.markers.length} markers trên bản đồ`);
    }

    /**
     * Load dữ liệu từ API và hiển thị trên bản đồ
     * @returns {Promise<number>} - Số lượng địa điểm đã load
     */
    async loadAndDisplay() {
        try {
            const response = await fetch('/api/places');
            const result = await response.json();

            if (result.success && result.data) {
                this.drawMarkers(result.data);
                return result.count || result.data.length;
            } else {
                console.error('API error:', result.error);
                return 0;
            }
        } catch (error) {
            console.error('Error loading places:', error);
            alert('Lỗi khi tải dữ liệu địa điểm!');
            return 0;
        }
    }
}


// ========== MAP INSTANCE - Lấy từ map_trans.js ==========
function getMapInstance() {
    if (!window.mapInstance) {
        console.error('❌ CRITICAL: Map chưa được khởi tạo từ map_trans.js!');
        return null;
    }
    return window.mapInstance;
}
// =======================================
/**
 * Vẽ đường đi bộ từ user → trạm (đường chấm chấm)
 */
function drawWalkingPath(fromCoords, toCoords, color = '#666') {
    const map = getMapInstance();

    if (!map) {
        console.error('❌ Map chưa được khởi tạo!');
        return null;
    }

    if (!fromCoords || !toCoords) return null;
    
    const walkPath = [
        [fromCoords.lat, fromCoords.lng || fromCoords.lon],
        [toCoords.lat || toCoords[0], toCoords.lng || toCoords.lon || toCoords[1]]
    ];
    
    return L.polyline(walkPath, {
        color: color,
        weight: 3,
        opacity: 0.7,
        dashArray: '10, 10',  // Đường chấm chấm
        className: 'walking-path'
    }).addTo(map);
}


function drawDetailedBusRoute(routeData, userStart, userEnd) {
    const map = getMapInstance();
    console.log("🎨 Vẽ chi tiết:", routeData);
    
    if (!map) {
        console.error('❌ Map chưa sẵn sàng!');
        return alert('Lỗi: Bản đồ chưa được tải');
    }

    // 1. Xóa layers cũ
    if (window.busLayers && window.busLayers.length > 0) {
        console.log(`🗑️ Xóa ${window.busLayers.length} layers cũ`);
        window.busLayers.forEach(layer => {
            try {
                map.removeLayer(layer); // ✅ Dùng map alias
            } catch(e) {
                console.warn('Không thể xóa layer:', e);
            }
        });
    }
    window.busLayers = [];
    
    // ========== [NEW] VẼ ĐƯỜNG ĐI BỘ ==========
    // A. Từ user → Trạm đầu
    if (routeData.walk_to_start) {
        const walkToStart = drawWalkingPath(
            userStart,  // Điểm user
            { lat: routeData.walk_to_start[0], lng: routeData.walk_to_start[1] },
            '#ff6b6b'  // Màu đỏ nhạt
        );
        if (walkToStart) {
            window.busLayers.push(walkToStart);
            
            // Marker trạm đầu
            const startMarker = L.marker([routeData.walk_to_start[0], routeData.walk_to_start[1]], {
                icon: L.divIcon({
                    html: `<div style="background:#4285F4; color:white; padding:5px 8px; border-radius:4px; font-size:11px; font-weight:bold; white-space:nowrap; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">
                        🚏 ${routeData.start_stop || 'Trạm đầu'}
                    </div>`,
                    className: 'station-label',
                    iconAnchor: [0, 0]
                })
            }).addTo(map);
            window.busLayers.push(startMarker);
            console.log('✅ Đã vẽ đường đi bộ → trạm đầu');
        }
    }
    
    // B. Từ Trạm cuối → user
    if (routeData.walk_from_end) {
        const walkFromEnd = drawWalkingPath(
            { lat: routeData.walk_from_end[0], lng: routeData.walk_from_end[1] },
            userEnd,  // Điểm đích
            '#ff6b6b'
        );
        if (walkFromEnd) {
            window.busLayers.push(walkFromEnd);
            
           // Marker trạm cuối
            const endMarker = L.marker([routeData.walk_from_end[0], routeData.walk_from_end[1]], {
                icon: L.divIcon({
                    html: `<div style="background:#EA4335; color:white; padding:5px 8px; border-radius:4px; font-size:11px; font-weight:bold; white-space:nowrap; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">
                        🚏 ${routeData.end_stop || 'Trạm cuối'}
                    </div>`,
                    className: 'station-label',
                    iconAnchor: [0, 0]
                })
            }).addTo(map);
            window.busLayers.push(endMarker);
            console.log('✅ Đã vẽ đường đi bộ từ trạm cuối →');
        }
    }
    // ==========================================
    
    // 2. Vẽ đường bus (code cũ của bạn giữ nguyên)
    console.log('🚌 Vẽ lộ trình bus...');

    if (routeData.segments && routeData.segments.length > 0) {
        routeData.segments.forEach(seg => {
            if (seg.type === 'bus' && seg.path && seg.path.length > 0) {
                const busLine = L.polyline(seg.path, {
                    color: seg.color || '#FF9800',
                    weight: 5,
                    opacity: 0.8
                }).addTo(map);
                window.busLayers.push(busLine);
            }
            else if (seg.type === 'transfer') {
                const transferMarker = L.marker([seg.lat, seg.lng], {
                    icon: L.divIcon({
                        html: '<div style="background:#FFA500; color:white; padding:8px; border-radius:50%; font-size:16px;">🔄</div>',
                        className: 'transfer-marker'
                    })
                }).addTo(map);
                window.busLayers.push(transferMarker);
            }
        });
        console.log(`✅ Đã vẽ ${routeData.segments.length} segments`);
    }  else {
        console.warn('⚠️ Không có segments để vẽ!');
    }
    
    // 3. Fit bounds (bao gồm cả điểm user)
    const allPoints = [
        [userStart.lat, userStart.lng || userStart.lon],
        [userEnd.lat, userEnd.lng || userEnd.lon]
    ];
    
    if (routeData.route_coordinates && routeData.route_coordinates.length > 0) {
        allPoints.push(...routeData.route_coordinates);
    }
    
    if (allPoints.length > 2) {
        map.fitBounds(allPoints, { 
            padding: [50, 50],
            maxZoom: 15 
        });
        console.log('🗺️ Đã zoom map vừa khít route');
    }
    
    console.log('✅ Hoàn tất vẽ Bus route!');
}

function drawMultiLegBusRoute(multiData, waypoints) {
    const map = getMapInstance();
    if (!map) return alert('Lỗi: Bản đồ chưa sẵn sàng.');
    
    // 1. Xóa layers cũ
    console.log('🗑️ Xóa tất cả layers cũ...');
    if (window.busLayers && window.busLayers.length > 0) {
        console.log(`🗑️ Xóa ${window.busLayers.length} layers cũ`);
        window.busLayers.forEach(layer => {
            try { map.removeLayer(layer); } catch(e) { }
        });
    }
    window.busLayers = [];

    // 2. Xóa routeLayerGroup nếu có
    if (window.routeLayerGroup) {
        console.log('  → Xóa routeLayerGroup');
        try {
            window.routeLayerGroup.clearLayers();
        } catch(e) {
            console.warn('Không thể xóa routeLayerGroup:', e);
        }
    }

    // 3. Gọi hàm clear global nếu có (từ map_trans.js)
    if (typeof window.clearExistingMapRoutes === 'function') {
        console.log('  → Gọi clearExistingMapRoutes()');
        window.clearExistingMapRoutes();
    }
    // =========================================
    console.log('🚌 Vẽ lộ trình Bus đa chặng...');
    const legColors = ['#4285F4', '#EA4335', '#FBBC04', '#34A853', '#9C27B0', '#FF6D00'];
    const allPoints = []; 

    if (!multiData.legs || multiData.legs.length === 0) return;

    multiData.legs.forEach((leg, legIndex) => {
        const legColor = legColors[legIndex % legColors.length];
        const legNumber = legIndex + 1;
        const isLastLeg = legIndex === multiData.legs.length - 1;

        // ====== A. ĐI BỘ RA TRẠM ĐẦU ======
        if (leg.walk_to_start) {
            const startWaypoint = waypoints[legIndex];
            const walkToStart = drawWalkingPath(
                { lat: startWaypoint.lat, lng: startWaypoint.lon || startWaypoint.lng },
                { lat: leg.walk_to_start[0], lng: leg.walk_to_start[1] },
                '#ff6b6b'
            );
            if (walkToStart) window.busLayers.push(walkToStart);
            
            // Marker Trạm Đầu
            const startStationMarker = L.marker([leg.walk_to_start[0], leg.walk_to_start[1]], {
                icon: L.divIcon({
                    html: `<div style="background:${legColor}; color:white; padding:5px 8px; border-radius:4px; font-size:11px; font-weight:bold; box-shadow: 0 2px 4px rgba(0,0,0,0.2); white-space:nowrap;">🚏 ${leg.start_stop || 'Trạm ' + legNumber}</div>`,
                    className: 'station-label',
                    iconAnchor: [0, 0]
                })
            }).addTo(map);
            window.busLayers.push(startStationMarker);
            allPoints.push(leg.walk_to_start);
        }

        // ====== B. VẼ BUS SEGMENTS ======
        if (leg.segments) {
            leg.segments.forEach(seg => {
                if (seg.type === 'bus' && seg.path) {
                    const busLine = L.polyline(seg.path, { 
                        color: legColor, 
                        weight: 5, 
                        opacity: 0.8 
                    }).addTo(map);
                    window.busLayers.push(busLine);
                    allPoints.push(...seg.path);
                } else if (seg.type === 'transfer') {
                    const tMarker = L.marker([seg.lat, seg.lng], {
                        icon: L.divIcon({ 
                            html: '<div style="background:#FFA500; color:white; padding:8px; border-radius:50%; font-size:16px;">🔄</div>', 
                            className: 'transfer-icon',
                            iconAnchor: [16, 16]
                        })
                    }).addTo(map);
                    window.busLayers.push(tMarker);
                }
            });
        }

        // ====== C. ĐI BỘ TỪ TRẠM CUỐI → ĐIỂM TIẾP THEO ======
        // ⚠️ KEY FIX: Vẽ walk_from_end cho MỌI leg (không chỉ leg cuối)
        if (leg.walk_from_end) {
            const nextWaypoint = waypoints[legIndex + 1]; // Điểm B, C...
            
            const walkFromEnd = drawWalkingPath(
                { lat: leg.walk_from_end[0], lng: leg.walk_from_end[1] },
                { lat: nextWaypoint.lat, lng: nextWaypoint.lon || nextWaypoint.lng },
                '#ff6b6b'
            );
            if (walkFromEnd) window.busLayers.push(walkFromEnd);
            
            // Marker Trạm Cuối của leg này
            const endStationMarker = L.marker([leg.walk_from_end[0], leg.walk_from_end[1]], {
                icon: L.divIcon({
                    html: `<div style="background:${legColor}; color:white; padding:5px 8px; border-radius:4px; font-size:11px; font-weight:bold; box-shadow: 0 2px 4px rgba(0,0,0,0.2); white-space:nowrap;">🚏 ${leg.end_stop || 'Trạm cuối ' + legNumber}</div>`,
                    className: 'station-label',
                    iconAnchor: [0, 0]
                })
            }).addTo(map);
            window.busLayers.push(endStationMarker);
            allPoints.push(leg.walk_from_end);
        }
    });

    // ====== D. VẼ MARKERS CHO WAYPOINTS (A, B, C) ======
    if (typeof window.createCustomMarker === 'function') {
        waypoints.forEach((wp, index) => {
            const label = String.fromCharCode(65 + index); // A, B, C...
            let color = '#fbbc04'; 
            if (index === 0) color = '#4285f4'; 
            else if (index === waypoints.length - 1) color = '#ea4335';

            createCustomMarker(map, wp.lat, wp.lon || wp.lng, color, label, wp.name);
            allPoints.push([wp.lat, wp.lon || wp.lng]);
        });
    }

    // ====== E. FIT BOUNDS ======
    if (allPoints.length > 0) {
        map.fitBounds(allPoints, { padding: [50, 50], maxZoom: 15 });
    }
    
    // ====== F. RENDER UI ======
    renderMultiLegList(multiData, waypoints);
    console.log('✅ Hoàn tất vẽ Multi-Leg Bus Route!');
}

function renderMultiLegList(multiData, waypoints) {
    const container = document.querySelector(".vehicle-scroll-container");
    if (!container) return;

    // 1. Backup giao diện cũ
    if (!window.originalVehicleListHTML) {
        window.originalVehicleListHTML = container.innerHTML;
    }

    // 2. Header: Nút Back + Tổng kết
    // Mình dùng innerHTML cho nhanh gọn
    const headerHTML = `
        <div style="padding: 0 5px 15px 5px; border-bottom: 1px solid #eee; margin-bottom: 15px;">
            <button onclick="restoreVehicleList()" style="background:none; border:none; color:#333; font-weight:600; cursor:pointer; display:flex; align-items:center; gap:5px; margin-bottom: 10px;">
                <i class="fas fa-arrow-left"></i> Quay lại
            </button>
            <div style="background: #e8f0fe; color: #1967d2; padding: 10px; border-radius: 8px; font-size: 13px; display: flex; justify-content: space-between; align-items: center;">
                <span><i class="fas fa-coins"></i> <b>${multiData.display_price}</b></span>
                <span><i class="fas fa-clock"></i> <b>${multiData.duration} phút</b></span>
                <span><i class="fas fa-route"></i> ${multiData.legs.length} chặng</span>
            </div>
        </div>
    `;

    // 3. Render Timeline
    let timelineHTML = '<div class="multi-leg-timeline" style="padding: 0 10px;">';
    
    const legs = multiData.legs || [];
    
    // Logic màu sắc giống hàm vẽ Map để đồng bộ
    // (A: Xanh, B: Vàng/Đỏ..., Cuối: Đỏ)
    const getPointColor = (index, total) => {
        if (index === 0) return '#4285F4'; // Điểm đầu: Xanh
        if (index === total - 1) return '#EA4335'; // Điểm cuối: Đỏ
        return '#FBBC04'; // Điểm giữa: Vàng
    };

    legs.forEach((leg, i) => {
        const pointLabel = String.fromCharCode(65 + i); // A, B, C...
        const pointName = waypoints[i] ? waypoints[i].name : `Điểm ${pointLabel}`;
        const color = getPointColor(i, waypoints.length);

        // --- PHẦN 1: ĐIỂM DỪNG (Node) ---
        timelineHTML += `
            <div style="display:flex; gap: 15px; position: relative;">
                <div style="display:flex; flex-direction:column; align-items:center; width: 30px;">
                    <div style="
                        width: 28px; height: 28px; 
                        background: ${color}; color: white; 
                        border-radius: 50%; 
                        display: flex; align-items: center; justify-content: center; 
                        font-weight: bold; font-size: 14px;
                        z-index: 2; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.2);
                    ">${pointLabel}</div>
                    
                    <div style="width: 2px; background: #ddd; flex: 1; min-height: 40px; margin-top: -2px; margin-bottom: -2px;"></div>
                </div>

                <div style="flex: 1; padding-bottom: 20px;">
                    <div style="font-weight: bold; font-size: 14px; color: #333; margin-top: 4px;">${pointName}</div>
                    
                    <div class="option-card" style="
                        margin-top: 10px; padding: 10px; 
                        border: 1px solid #eee; background: #fff; 
                        border-left: 3px solid ${color}; border-radius: 4px;
                        box-shadow: 0 1px 3px rgba(0,0,0,0.05);
                    ">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <span style="font-weight:bold; color:#2c3e50;">${leg.route_name}</span>
                            <span style="font-size:11px; background:#f1f3f4; padding:2px 6px; border-radius:4px; font-weight:bold;">
                                ${leg.display_price}
                            </span>
                        </div>
                        <div style="font-size:12px; color:#666; margin-top:4px; font-style: italic;">
                            ${leg.description}
                        </div>
                        <div style="font-size:11px; color:#888; margin-top:6px; display:flex; gap:10px;">
                            <span><i class="fas fa-walking"></i> ${leg.walk_distance}m đi bộ</span>
                            <span><i class="fas fa-clock"></i> ${leg.duration} phút</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    });

    // --- PHẦN 3: ĐIỂM CUỐI CÙNG (Kết thúc hành trình) ---
    if (waypoints.length > 0) {
        const lastIdx = waypoints.length - 1;
        const lastLabel = String.fromCharCode(65 + lastIdx);
        const lastName = waypoints[lastIdx].name;
        const lastColor = getPointColor(lastIdx, waypoints.length);

        timelineHTML += `
            <div style="display:flex; gap: 15px;">
                <div style="display:flex; flex-direction:column; align-items:center; width: 30px;">
                    <div style="
                        width: 28px; height: 28px; 
                        background: ${lastColor}; color: white; 
                        border-radius: 50%; 
                        display: flex; align-items: center; justify-content: center; 
                        font-weight: bold; font-size: 14px;
                        z-index: 2; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.2);
                    ">${lastLabel}</div>
                </div>
                <div style="flex: 1;">
                    <div style="font-weight: bold; font-size: 14px; color: #333; margin-top: 4px;">${lastName}</div>
                    <div style="font-size: 12px; color: #888;">Điểm kết thúc</div>
                </div>
            </div>
        `;
    }

    timelineHTML += '</div>'; // Đóng div timeline

    // 4. Render vào container
    container.innerHTML = headerHTML + timelineHTML;
}

// =========================================================================
// 7. BUS LOGIC - XỬ LÝ DANH SÁCH LỰA CHỌN (UPDATED)
// =========================================================================

async function handleBusSelection() {
    console.log("🚌 Đang lấy danh sách lộ trình xe buýt...");
    
    const map = getMapInstance();
    if (!map) {
        return alert('Lỗi: Bản đồ chưa sẵn sàng. Vui lòng tải lại trang.');
    }
    
    // Lấy dữ liệu từ localStorage
    const storedRouteJson = localStorage.getItem('selectedRoute');
    if (!storedRouteJson) return alert("Lỗi: Không tìm thấy dữ liệu hành trình.");
    
    const storedRoute = JSON.parse(storedRouteJson);
    
    // Xác định điểm đầu/cuối
    let userStart, userEnd;
    if (storedRoute.waypoints && storedRoute.waypoints.length >= 2) {
        userStart = storedRoute.waypoints[0];
        userEnd = storedRoute.waypoints[storedRoute.waypoints.length - 1];
    } else {
        userStart = storedRoute.start_place;
        userEnd = storedRoute.end_place;
    }
    
    // Hiển thị loading
    const priceEl = document.querySelector('.option-card.selected .price');
    const originalText = priceEl ? priceEl.textContent : "";
    if (priceEl) priceEl.textContent = "⏳...";
    
    try {
        const isMultiStop = storedRoute.waypoints && storedRoute.waypoints.length > 2;
        
        if (isMultiStop) {
            // ========== XỬ LÝ ĐA ĐIỂM: TÁCH THÀNH CÁC CHẶNG ==========
            console.log("🔀 Xử lý hành trình đa điểm...");
            await handleMultiStopBusRoute(storedRoute.waypoints);
        } else {
            // ========== XỬ LÝ 2 ĐIỂM (GIỮ NGUYÊN LOGIC CŨ) ==========
            const payload = {
                start: { 
                    lat: parseFloat(userStart.lat), 
                    lon: parseFloat(userStart.lon || userStart.lng) 
                },
                end: { 
                    lat: parseFloat(userEnd.lat), 
                    lon: parseFloat(userEnd.lon || userEnd.lng) 
                }
            };
            
            const response = await fetch('/api/bus/find', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            
            const res = await response.json();
            
            if (res.success && res.routes && res.routes.length > 0) {
                
                // ✅ CHECK OSRM NEEDED
                if (res.routes[0].osrm_needed) {
                    console.log("🗺️ osrm_needed=true, gọi OSRM...");
                    console.log("Start:", res.routes[0].start_coords);
                    console.log("End:", res.routes[0].end_coords);
                    
                    try {
                        const osrmRes = await fetch('/api/find-route-osm', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                start: res.routes[0].start_coords,
                                end: res.routes[0].end_coords,
                                vehicle_type: 'car'
                            })
                        });
                        
                        console.log("OSRM Response status:", osrmRes.status);
                        const osrmData = await osrmRes.json();
                        console.log("OSRM Data:", osrmData);
                        
                        if (osrmData.success && osrmData.data) {
                            const finalRoute = {
                                ...res.routes[0],
                                route_coordinates: osrmData.data.route_coordinates,
                                segments: [{
                                    'type': 'bus',
                                    'path': osrmData.data.route_coordinates,
                                    'name': res.routes[0].route_name
                                }],
                                duration: osrmData.data.duration_min ? Math.ceil(osrmData.data.duration_min) : 30,
                                walk_distance: osrmData.data.distance_km ? Math.ceil(osrmData.data.distance_km * 1000) : 0
                            };
                            
                            console.log("✅ Final route:", finalRoute);
                            renderBusOptionsList([finalRoute], userStart, userEnd);
                        } else {
                            console.error("OSRM error:", osrmData);
                            alert("❌ OSRM error: " + (osrmData.error || "Unknown"));
                        }
                    } catch (osrmError) {
                        console.error("❌ OSRM API error:", osrmError);
                        alert("❌ Lỗi vẽ đường OSRM: " + osrmError.message);
                    }
                } else {
                    console.log("✅ Bus route bình thường");
                    renderBusOptionsList(res.routes, userStart, userEnd);
                }
            } else if (res.fallback === 'osrm') {
                    // ========== FALLBACK OSRM (KHÔNG CÓ BUS) ==========
                    console.log("🗺️ fallback=osrm, gọi OSRM...");
                    
                    try {
                        const osrmRes = await fetch('/api/find-route-osm', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                start: res.start_coords,
                                end: res.end_coords,
                                vehicle_type: 'car'
                            })
                        });
                        
                        const osrmData = await osrmRes.json();
                        console.log("OSRM Data:", osrmData);
                        
                        if (osrmData.success && osrmData.data) {
                            // ✅ TẠO ROUTE MỚI từ OSRM data, KHÔNG spread res.routes[0]
                            let finalRoute = {
                                route_name: "Đường bộ",
                                route_type: "walking", // hoặc "car"
                                route_coordinates: osrmData.data.route_coordinates,
                                segments: [{
                                    type: 'walk', // hoặc 'car'
                                    path: osrmData.data.route_coordinates,
                                    name: 'Đường bộ'
                                }],
                                duration: osrmData.data.duration_min ? Math.ceil(osrmData.data.duration_min) : 30,
                                distance: osrmData.data.distance_km ? osrmData.data.distance_km : 0,
                                walk_distance: osrmData.data.distance_km ? Math.ceil(osrmData.data.distance_km * 1000) : 0,
                                labels: ["Đi bộ"], // ✅ QUAN TRỌNG: Thêm labels để tránh lỗi
                                description: `Di chuyển ${Math.ceil(osrmData.data.distance_km * 1000)}m`,
                                start_coords: res.start_coords,
                                end_coords: res.end_coords
                            };
                            
                            // ✅ Chuẩn hóa dữ liệu
                            finalRoute = normalizeRouteData(finalRoute); 
                            
                            console.log("✅ Final fallback route:", finalRoute);
                            
                            // ✅ Truyền finalRoute đã chuẩn hóa, KHÔNG phải osrmData.data
                            renderBusOptionsList([finalRoute], userStart, userEnd);
                            
                        } else {
                            alert("❌ OSRM error: " + (osrmData.error || "Unknown"));
                        }
                    } catch (osrmError) {
                        console.error("OSRM error:", osrmError);
                        alert("❌ Lỗi OSRM: " + osrmError.message);
                    }
                }
            else {
                alert("❌ " + (res.error || "Không tìm thấy tuyến xe"));
            }
        }
    } catch (e) {
        console.error("❌ Error:", e);
        alert("Lỗi: " + e.message);
    } finally {
        if (priceEl) priceEl.textContent = originalText;
    }
}

/**
 * Xử lý đa điểm: Gọi API cho từng chặng riêng biệt
 */
async function handleMultiStopBusRoute(waypoints) {
    console.log(`📍 Tìm route cho ${waypoints.length} điểm...`);
    
    const legs = [];
    let totalPrice = 0;
    let totalDuration = 0;
    let hasError = false;
    
    // Tạo các chặng: A→B, B→C, C→D...
    for (let i = 0; i < waypoints.length - 1; i++) {
        const start = waypoints[i];
        const end = waypoints[i + 1];
        const legLabel = `${String.fromCharCode(65 + i)} → ${String.fromCharCode(65 + i + 1)}`;
        
        console.log(`🔍 Tìm route cho chặng ${legLabel}...`);
        
        try {
            const response = await fetch('/api/bus/find', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    start: { 
                        lat: parseFloat(start.lat), 
                        lon: parseFloat(start.lon || start.lng) 
                    },
                    end: { 
                        lat: parseFloat(end.lat), 
                        lon: parseFloat(end.lon || end.lng) 
                    }
                })
            });
            
            const res = await response.json();
            
            if (res.success && res.routes && res.routes.length > 0) {
                const bestRoute = res.routes[0];
                
                // ✅ CHECK OSRM NEEDED CHO ĐA ĐIỂM
                let finalRoute = bestRoute;
                
                if (bestRoute.osrm_needed) {
                    try {
                        const osrmRes = await fetch('/api/find-route-osm', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                start: bestRoute.start_coords,
                                end: bestRoute.end_coords,
                                vehicle_type: 'car'
                            })
                        });
                        
                        const osrmData = await osrmRes.json();
                        
                        if (osrmData.success && osrmData.data) {
                            finalRoute = {
                                ...bestRoute,
                                route_coordinates: osrmData.data.route_coordinates,
                                segments: [{
                                    'type': 'bus',
                                    'path': osrmData.data.route_coordinates,
                                    'name': bestRoute.route_name
                                }],
                                duration: osrmData.data.duration_min || 30,
                                walk_distance: osrmData.data.distance_km ? Math.ceil(osrmData.data.distance_km * 1000) : 0
                            };
                        }
                    } catch (osrmError) {
                        console.error(`OSRM error for leg ${legLabel}:`, osrmError);
                    }
                }
                
                const leg = {
                    route_name: finalRoute.route_name || `Chặng ${i + 1}`,
                    description: finalRoute.description || legLabel,
                    walk_to_start: finalRoute.walk_to_start,
                    walk_from_end: finalRoute.walk_from_end,
                    start_stop: finalRoute.start_stop,
                    end_stop: finalRoute.end_stop,
                    segments: finalRoute.segments,
                    duration: finalRoute.duration || 15,
                    walk_distance: finalRoute.walk_distance || 0,
                    display_price: finalRoute.display_price || '7.000đ',
                    price: finalRoute.price || 7000
                };
                
                legs.push(leg);
                totalPrice += leg.price;
                totalDuration += leg.duration;
                
                console.log(`✅ Chặng ${legLabel}: ${leg.route_name}`);
            } else {
                alert(`❌ Không tìm thấy tuyến cho ${legLabel}`);
                hasError = true;
                break;
            }
        } catch (e) {
            console.error(`Error leg ${legLabel}:`, e);
            alert(`Lỗi chặng ${legLabel}: ${e.message}`);
            hasError = true;
            break;
        }
    }
    
    if (!hasError && legs.length === waypoints.length - 1) {
        const multiLegData = {
            mode_name: "Hành trình Bus Đa Điểm",
            legs: legs,
            display_price: `${totalPrice.toLocaleString('vi-VN')}đ`,
            duration: totalDuration
        };
        
        drawMultiLegBusRoute(multiLegData, waypoints);
    }
}

function getRandomBusColor() {
    const colors = [
        '#7fb8f1ff', // Xanh dương
        '#f3b989ff', // Cam
        '#5e805fff', // Xanh lá đậm
        '#8b7a7aff', // Đỏ
        '#61a3aaff', // Xanh ngọc
        '#6d6f7cff', // Cam đậm
    ];
    return colors[Math.floor(Math.random() * colors.length)];
}

/**
 * Hiển thị danh sách các phương án xe buýt (Sub-menu)
 */
function renderBusOptionsList(options, userStart, userEnd) {
    const container = document.querySelector('.vehicle-scroll-container');
    
    // 1. Lưu lại nội dung cũ (Danh sách Grab/Be) để nút Back khôi phục lại
    if (!window.originalVehicleListHTML) {
        window.originalVehicleListHTML = container.innerHTML;
    }

    // 2. Xóa danh sách cũ và thêm nút Back
    container.innerHTML = `
        <div style="padding: 0 5px 10px 5px; border-bottom: 1px solid #eee; margin-bottom: 10px;">
            <button onclick="restoreVehicleList()" style="background:none; border:none; color:#333; font-weight:600; cursor:pointer; display:flex; align-items:center; gap:5px;">
                <i class="fas fa-arrow-left"></i> Quay lại danh sách phương tiện
            </button>
            <div style="font-size:13px; color:#666; margin-top:5px; margin-left:20px;">
                Tìm thấy ${options.length} lộ trình phù hợp:
            </div>
        </div>
    `;

    // 3. Render từng phương án (Option)
    options.forEach((opt, index) => {
        // Màu sắc phân biệt: Direct (Xanh lá) vs Transfer (Cam)
        const labels = opt.labels || [];
        const isDirect =  labels.includes("Đi thẳng");

        const badgeColor = isDirect ? '#4caf50' : '#ff9800'; // Green vs Orange
        const badgeText = isDirect ? 'Đi thẳng' : 'Chuyển tuyến';
        
        let busBadgesHTML = ""; // Mặc định

        // Đảm bảo description luôn là chuỗi để tránh lỗi
        const descText = opt.description || "";

        const matches = descText.match(/tuyến (\d+)/g); // Tìm tất cả các cụm "tuyến ..."
        
        if (matches && matches.length > 0) {
            // Biến đổi từng kết quả tìm được thành HTML
            const badgesArray = matches.map((m) => {
                const busNum = m.replace("tuyến ", "").trim();
                const randomColor = getRandomBusColor(); // Lấy màu ngẫu nhiên
                
                return `
                    <span style="
                        background: ${randomColor}; 
                        color: white; 
                        padding: 2px 8px; 
                        border-radius: 6px; 
                        font-weight: bold; 
                        font-size: 13px; 
                        display: inline-flex; 
                        align-items: center; 
                        gap: 5px;
                        box-shadow: 0 1px 2px rgba(0,0,0,0.2);
                    ">
                        <i class="fas fa-bus" style="font-size: 11px;"></i> 
                        <span style="text-decoration: underline; text-underline-offset: 2px;">${busNum}</span>
                    </span>
                `;
            });
            
            // Nối các thẻ lại với nhau bằng dấu chấm tròn nhỏ màu xám
            busBadgesHTML = badgesArray.join('<span style="color: #bbb; font-size: 10px; margin: 0 4px;">&#9679;</span>');
        } else {
            // Trường hợp: Dữ liệu API không ghi rõ "tuyến số mấy" (Ví dụ dòng: "Đổi xe tại Phạm Viết Chánh")
            // Ta hiển thị mặc định chữ "Bus" để giao diện không bị trống
            busBadgesHTML = `
                <span style="background:#757575; color:white; padding:2px 8px; border-radius:6px; font-size:13px; font-weight:bold;">
                    <i class="fas fa-bus"></i> Bus
                </span>`;
        }

        // Nếu không có giá, mặc định là 7.000đ (cho 1 chuyến) hoặc 0đ
        let finalPrice = opt.display_price;
        if (!finalPrice || finalPrice === 'undefined') {
            // Logic tạm: Nếu đi thẳng (1 chuyến) = 7k, Chuyển tuyến (2 chuyến) = 14k
            finalPrice = isDirect ? '7.000đ' : '14.000đ';
        }

        // Tạo thẻ HTML cho từng option
        const cardHtml = `
            <div class="option-card bus-sub-option" onclick="selectBusRoute(${index})" 
                 style="border-left: 4px solid ${badgeColor}; margin-bottom:8px;">

                <div class="option-left" style="flex: 1;">
                    <div class="vehicle-info">
                        <div class="vehicle-info">
                            <div style="display:flex; align-items:center; margin-bottom: 6px; flex-wrap: wrap;">
                                ${busBadgesHTML}
                            
                                <span style="font-size:10px; background:${badgeColor}; color:white; padding:2px 6px; border-radius:4px; margin-left:5px;">
                                    ${badgeText}
                                </span>
                            </div>

                            <div style="font-size: 12px; color: #666; display: flex; align-items: center; gap: 8px;">
                                <span><i class="fas fa-walking"></i> ${opt.walk_distance}m</span>
                                <span style="color: #ddd;">|</span>
                                <span><i class="fas fa-clock"></i> ${opt.duration} phút</span>
                            </div>

                            <div style="font-size: 11px; color: #888; margin-top:2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 200px;">
                                ${opt.description}
                            </div>
                        </div>
                    </div>
                </div>

                <div class="option-right" style="display:flex; align-items:center; padding-left: 10px;">
                    <div class="price" style="font-weight: bold; font-size: 14px; color:#2c3e50;">
                        ${finalPrice}
                    </div>
                </div>
            </div>
        `;
        container.insertAdjacentHTML('beforeend', cardHtml);
    }
);

    // Lưu tạm danh sách options vào biến global để dùng khi click
    window.currentBusOptions = { data: options, start: userStart, end: userEnd };
}

/**
 * Xử lý khi chọn 1 lộ trình cụ thể
 */
window.selectBusRoute = function(index) {
    if (!window.currentBusOptions) return;

    // 1. Highlight thẻ được chọn
    document.querySelectorAll('.bus-sub-option').forEach(c => c.classList.remove('selected'));
    document.querySelectorAll('.bus-sub-option')[index].classList.add('selected');

    // 2. Vẽ đường lên map
    const selectedOption = window.currentBusOptions.data[index];
    const { start, end } = window.currentBusOptions;
    
    drawDetailedBusRoute(selectedOption, start, end);
};

/**
 * Quay lại danh sách phương tiện chính (Grab/Be/Bus tổng)
 */
window.restoreVehicleList = function() {
    console.log('🔙 Khôi phục danh sách phương tiện...');
    
    const container = document.querySelector('.vehicle-scroll-container');
    
    if (window.originalVehicleListHTML) {
        container.innerHTML = window.originalVehicleListHTML;
        console.log('✅ Đã restore HTML gốc');
        
        // ========== GẮN LẠI EVENT LISTENERS ==========
        // Vì innerHTML mất hết event listeners
        if (typeof setupCardSelectionEvents === 'function') {
            window.setupCardSelectionEvents();
            console.log('✅ Đã gắn lại event listeners');
        }
        // ============================================


        
        // Xóa các layers bus trên map
        const map = getMapInstance();
        if (map && window.busLayers) {
            window.busLayers.forEach(layer => {
                try { map.removeLayer(layer); } catch(e) {}
            });
            window.busLayers = [];
            console.log('🗑️ Đã xóa các layers bus');
        }
        
        // TODO: Vẽ lại route tổng quan (Grab/Be) nếu cần
        try {
            const storedRouteJson = localStorage.getItem('selectedRoute');
            if (storedRouteJson) {
                const routeData = JSON.parse(storedRouteJson);
                
                // Kiểm tra xem có dữ liệu đường đi không
                if (routeData.route_coordinates && typeof window.drawRouteOnMap === 'function') {
                    console.log('🔄 Đang vẽ lại lộ trình chính...');
                    
                    // Gọi hàm vẽ lại với đầy đủ tham số
                    window.drawRouteOnMap(
                        routeData.route_coordinates, // Tọa độ đường đi
                        routeData.start_place,       // Điểm đầu
                        routeData.end_place,         // Điểm cuối
                        routeData.waypoints          // Các điểm dừng (A, B...)
                    );
                }
            }
        } catch (e) {
            console.error("Lỗi khi vẽ lại đường cũ:", e);
        }
    } else {
        console.warn('⚠️ Không có backup HTML để restore!');
    }
};

/**
 * 🧹 HÀM DỌN DẸP BẢN ĐỒ (GLOBAL CLEAR)
 * Xóa sạch các đường vẽ, marker, và reset biến trạng thái liên quan đến lộ trình.
 */
window.clearExistingMapRoutes = function() {
    console.log("🧹 Đang dọn dẹp bản đồ...");

    const map = window.mapInstance || (typeof getMapInstance === 'function' ? getMapInstance() : null);

    // 1. Xóa RouteLayerGroup (Layer chính chứa đường đi Car/Moto/Walk cơ bản)
    if (window.routeLayerGroup) {
        window.routeLayerGroup.clearLayers();
    }

    // 2. Xóa Bus Layers (Mảng chứa các đoạn đường Bus, icon trạm, đường đi bộ đứt nét...)
    if (window.busLayers && Array.isArray(window.busLayers)) {
        window.busLayers.forEach(layer => {
            if (map) {
                try { map.removeLayer(layer); } catch (e) { console.warn("Lỗi xóa layer bus:", e); }
            }
        });
        window.busLayers = []; // Reset mảng về rỗng
    }

    // 3. Xóa Routing Control (Nếu dùng thư viện Leaflet Routing Machine cũ/ngoài luồng)
    if (window.routingControl && map) {
        try { map.removeControl(window.routingControl); } catch (e) {}
        window.routingControl = null;
    }

    // 4. Xóa các container chỉ đường còn sót lại trong DOM (nếu có)
    document.querySelectorAll('.leaflet-routing-container').forEach(el => el.remove());

    // 5. Reset các biến trạng thái Global
    window.currentBusOptions = null; // Xóa danh sách options bus đang lưu tạm

    console.log("✨ Bản đồ đã được làm sạch!");
};

// Hàm phụ trợ để đảm bảo dữ liệu luôn đúng (Thêm hàm này vào cuối file hoặc đầu file)// ... (Đoạn code trong handleBusSelection)

// Logic chuẩn hóa dữ liệu thông minh hơn
function normalizeRouteData(route, userStart, userEnd) {
    // 1. Tự tính khoảng cách nếu backend trả về null/0
    let finalDist = route.walk_distance || 0;
    
    // Nếu thiếu distance, tự tính khoảng cách từ điểm đi -> điểm đến (chim bay)
    if (!finalDist || finalDist === 0) {
        // Lấy tọa độ start/end từ route (nếu có) hoặc từ user input
        const sLat = route.start_coords ? route.start_coords[0] : userStart.lat;
        const sLon = route.start_coords ? route.start_coords[1] : (userStart.lon || userStart.lng);
        
        const eLat = route.end_coords ? route.end_coords[0] : userEnd.lat;
        const eLon = route.end_coords ? route.end_coords[1] : (userEnd.lon || userEnd.lng);

        // Gọi hàm Haversine vừa thêm
        finalDist = getDistanceMeters(sLat, sLon, eLat, eLon);
        
        // Nhân 1.3 để ước lượng đường đi thực tế (vì đường không thẳng tắp)
        finalDist = Math.round(finalDist * 1.3); 
    }

    // 2. Tự tính thời gian nếu thiếu
    let finalDuration = route.duration || 0;
    if (!finalDuration || finalDuration === 0) {
        finalDuration = estimateDuration(finalDist);
    }

    return {
        ...route,
        description: route.description || "", // Chống lỗi .match()
        walk_distance: finalDist,             // Đã tự tính
        duration: finalDuration,              // Đã tự tính
        display_price: route.display_price || (route.price ? route.price.toLocaleString() + 'đ' : '7.000đ')
    };
}

// ... (Sau đó dùng hàm này bọc dữ liệu trước khi render)
// Ví dụ: 
// const safeRoute = normalizeRouteData(finalRoute, userStart, userEnd);
// renderBusOptionsList([safeRoute], userStart, userEnd);

/**
 * ============================================================
 * HELPER: CÁC HÀM TÍNH TOÁN KHOẢNG CÁCH & THỜI GIAN (FALLBACK)
 * ============================================================
 */

// 1. Công thức Haversine: Tính khoảng cách giữa 2 tọa độ (đơn vị: mét)
function getDistanceMeters(lat1, lon1, lat2, lon2) {
    if (!lat1 || !lon1 || !lat2 || !lon2) return 0; // Thiếu tọa độ thì chịu

    const R = 6371e3; // Bán kính trái đất (mét)
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return Math.round(R * c); // Trả về số mét làm tròn
}

// 2. Ước lượng thời gian (phút) dựa trên khoảng cách
// Giả sử: Tốc độ trung bình (Bus + Đi bộ) khoảng 20km/h = 333m/phút
function estimateDuration(distanceMeters) {
    const avgSpeedMetersPerMin = 300; // Tốc độ trung bình (hơi chậm để trừ hao kẹt xe)
    const minutes = Math.ceil(distanceMeters / avgSpeedMetersPerMin);
    return minutes < 5 ? 5 : minutes; // Tối thiểu 5 phút
}
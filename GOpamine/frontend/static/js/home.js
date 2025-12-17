// --- 1. TỪ ĐIỂN NGÔN NGỮ (VI <-> EN-GB) ---
const translations = {
    "vi": {
        "home": "Trang chủ",
        "assistant": "Trợ lý AI",
        "suggestions": "Gợi ý",
        "about_us": "Về chúng tôi",
        "contact": "Liên hệ",
        "guide": "Hướng dẫn",
        "login_signup": "Đăng nhập / Đăng ký",
        "hero_title": "Khám phá hành trình hoàn hảo của bạn.",
        "hero_desc": "Nền tảng AI kiến tạo lộ trình du lịch cá nhân hóa, tối ưu hóa chi phí, thời gian và trải nghiệm của bạn.",
        "btn_start": "Khám phá lộ trình của bạn",
        "btn_chat_ai": "Trò chuyện cùng AI",
        "btn_signup": "Tạo tài khoản",
        "acc_exist": "Đã có tài khoản?",
        "btn_login": "Đăng nhập",
        "featured_title": "Khám phá thành phố Hồ Chí Minh",
        "featured_desc": "Thành phố lớn nhất Việt Nam với lịch sử phong phú và văn hoá sôi nổi.",
        "card_benthanh": "Chợ Bến Thành",
        "card_benthanh_desc": "Biểu tượng Sài Gòn, chợ lâu đời, sầm uất.",
        "war_rem": "Bảo tàng Chứng tích Chiến tranh",
        "war_rem_desc": "Trưng bày hậu quả chiến tranh, nhắc nhở giá trị hòa bình.",
        "notre_dame": "Nhà thờ Đức bà Sài Gòn",
        "notre_dame_desc": "Biểu tượng trung tâm, nơi check-in kiến trúc Châu Âu.",
        "first_metro": "Tuyến Metro số 1",
        "first_metro_desc": "Tàu điện hiện đại, kết nối nhanh các điểm tham quan.",
        "landmark": "Landmark 81",
        "landmark_desc": "Tòa nhà cao nhất Việt Nam, ngắm Sài Gòn trên mây.",
        "sg_post": "Bưu điện Sài Gòn",
        "sg_post_desc": "Kiến trúc Pháp cổ, hoạt động, gửi thư vượt thời gian.",
        "view_more": "Xem thêm",
        "why_us": "Tại sao chọn chúng tôi?",
        "why_us_desc": "Nền tảng AI tiên tiến giúp bạn tìm kiếm phương tiện di chuyển hoàn hảo.",
        "cost": "Tối ưu chi phí",
        "cost_desc": "So sánh giá cả từ nhiều nhà cung cấp để tìm ra lựa chọn phù hợp nhất.",
        "personalise": "Trải nghiệm cá nhân",
        "personalise_desc": "Tùy chỉnh gợi ý dựa trên sở thích cá nhân và lịch sử di chuyển.",
        "interactive": "Bản đồ tương tác",
        "interactive_desc": "Khám phá lộ trình với bản đồ tương tác, xem trước các điểm dừng và địa điểm thú vị trên đường đi.",
        "time":"Tiết kiệm thời gian",
        "time_desc":"Tính toán thời gian di chuyển chính xác, bao gồm cả thời gian chờ đợi và kết nối giữa các phương tiện.",
        "safety": "Đảm bảo an toàn",
        "safety_desc": "Đánh giá mức độ an toàn của từng phương tiện dựa trên dữ liệu thống kê và đánh giá người dùng.",
        "ai": "AI thông minh",
        "ai_desc": "Thuật toán AI tiên tiến phân tích hàng triệu dữ liệu để đưa ra gợi ý tối ưu nhất cho hành trình của bạn.",
        "reviews_title": "Đánh giá từ cộng đồng",
        "reviews_title": "Đánh giá từ cộng đồng",
        "reviews_desc": "Những chia sẻ thực tế từ người dùng đã trải nghiệm GOpamine.",
        "reviews_empty": "Chưa có đánh giá nào. Hãy là người đầu tiên chia sẻ trải nghiệm!",
        "reviews_share_btn": "Chia sẻ trải nghiệm của bạn",
        "footer_about_title": "GOpamine",
        "footer_about_desc": "Nền tảng AI giúp bạn tìm kiếm phương tiện di chuyển tối ưu cho mọi hành trình.",
        "footer_search": "Tìm kiếm phương tiện",
        "footer_plan": "Lập kế hoạch hành trình",
        "footer_compare": "So sánh giá cả",
        "footer_AI": "Trợ lý AI",
        "footer_connect": "Kết nối",
        "rights_reserved": "© 2025 GOpamine. Mọi quyền được bảo lưu.",
        "privacy": "Chính sách bảo mật",
        "terms": "Điều khoản dịch vụ",
        "footer_address": "Địa chỉ: 227 Nguyễn Văn Cừ, phường Chợ Quán, Thành phố Hồ Chí Minh"
    },
    "en": {
        "home": "Home",
        "assistant": "AI Assistant",
        "suggestions": "Suggestions",
        "about_us": "About Us",
        "contact": "Contact",
        "guide": "Guide",
        "login_signup": "Log In / Sign Up",
        "hero_title": "Discover your perfect journey.",
        "hero_desc": "AI recommends optimal transport modes based on your budget, time, and preferences.",
        "btn_start": "Start Planning Route",
        "btn_chat_ai": "Chat with AI",
        "btn_signup": "Create Account",
        "acc_exist": "Already have an account?",
        "btn_login": "Log In",
        "featured_title": "Explore Ho Chi Minh City",
        "featured_desc": "Vietnam's largest city with rich history and vibrant culture.",
        "card_benthanh": "Ben Thanh Market",
        "card_benthanh_desc": "Saigon's icon, a bustling and historic market.",
        "war_rem": "War Remnants Museum",
        "war_rem_desc": "Exhibits war consequences, a reminder of the value of peace.",
        "notre_dame": "Notre-Dame Cathedral Basilica",
        "notre_dame_desc": "City centre icon, a check-in spot with European architecture.",
        "first_metro": "Metro Line No. 1",
        "first_metro_desc": "Modern electric train, quickly connecting attractions.",
        "landmark": "Landmark 81",
        "landmark_desc": "Vietnam's tallest building, view Saigon from the clouds.",
        "sg_post": "Saigon Central Post Office",
        "sg_post_desc": "Ancient French architecture, fully operational, sending timeless letters.",
        "view_more": "View more",
        "why_us": "Why choose us?",
        "why_us_desc": "Advanced AI platform helps you find the perfect transport mode.",
        "cost": "Cost optimisation",
        "cost_desc": "Compare prices from multiple providers to find the most suitable option.",
        "personalise": "Personalised experience",
        "personalise_desc": "Customise suggestions based on personal preferences and travel history.",
        "interactive": "Interactive maps",
        "interactive_desc": "Explore the route with the interactive map, preview interludes and interesting landmarks on your way.",
        "time":"Time saving",
        "time_desc":"Calculate exact moving time, including waiting time and connections between vehicles.",
        "safety": "Safety assuring",
        "safety_desc": "Rate vehicle's level based on statistics and users' rating.",
        "ai": "Intelligent AI",
        "ai_desc": "Up-to-date AI algorithms is utilised to analyse millions of information to give the most efficient recommendations to your journey.",
        "reviews_title": "Community Reviews",
        "reviews_desc": "Real experiences shared by users who have tried GOpamine.",
        "reviews_empty": "No reviews yet. Be the first to share your experience!",
        "reviews_share_btn": "Share Your Experience",
        "footer_about_title": "GOpamine",
        "footer_about_desc": "AI platform helping you find optimal transport for every journey.",
        "footer_search": "Transport Search",
        "footer_plan": "Journey Planning",
        "footer_compare": "Price Comparison",
        "footer_connect": "Connect",
        "footer_AI": "AI Assistant",
        "rights_reserved": "© 2025 GOpamine. All rights reserved.",
        "privacy": "Privacy Policy",
        "terms": "Terms of Service",
        "footer_address": "Address: 227 Nguyễn Văn Cừ St, Chợ Quán Ward, HCMC"
    }
};

document.addEventListener('DOMContentLoaded', function() {
    console.log(">>> JS LOADER: Đã tải thành công (Phiên bản sửa lỗi Case-Sensitive)");

    // Merge translations vào window.translations (nếu đã có từ base.html)
    if (!window.translations) {
        window.translations = { vi: {}, en: {} };
    }
    if (!window.translations.vi) {
        window.translations.vi = {};
    }
    if (!window.translations.en) {
        window.translations.en = {};
    }
    
    // Merge translations từ home.js vào window.translations
    Object.assign(window.translations.vi, translations.vi);
    Object.assign(window.translations.en, translations.en);
    
    // Sử dụng window.translations thay vì translations local
    const translationsToUse = window.translations;

    // --- KHỞI TẠO BIẾN NGÔN NGỮ ---
    // Lấy từ LocalStorage, nếu không có thì mặc định là 'vi' (viết thường)
    // QUAN TRỌNG: Luôn ép về chữ thường (.toLowerCase()) để tránh lỗi "VI"
    let currentLang = (localStorage.getItem('userLang') || localStorage.getItem('language') || 'vi').toLowerCase();
    
    console.log(">>> Ngôn ngữ khởi tạo:", currentLang);

    // --- CÁC PHẦN TỬ DOM ---
    const langSwitch = document.getElementById('langSwitch');
    const menuBtn = document.getElementById('menu-toggle');
    const closeBtn = document.getElementById('menu-close');
    const mobileMenu = document.getElementById('mobile-menu');
    const viewMoreBtn = document.getElementById('view-more-btn');

    // --- HÀM CẬP NHẬT GIAO DIỆN (UI) ---
    function updateUI(lang) {
        // 1. Cập nhật nút gạt (Toggle)
        if (langSwitch) {
            if (lang === 'vi') {
                langSwitch.classList.add('active');
            } else {
                langSwitch.classList.remove('active');
            }
        }

        // 2. Cập nhật nội dung chữ (Content)
        const elements = document.querySelectorAll('[data-i18n]');
        let count = 0;
        let missing = 0;

        elements.forEach(element => {
            const key = element.getAttribute('data-i18n');
            
            // Sử dụng window.translations (đã merge từ base.html và home.js)
            const trans = window.translations && window.translations[lang];
            
            // Kiểm tra an toàn:
            // 1. trans có tồn tại không? (ví dụ 'vi')
            // 2. Key có tồn tại trong ngôn ngữ đó không?
            if (trans && trans[key]) {
                element.textContent = trans[key];
                count++;
            } else {
                console.warn(`⚠️ Thiếu key: "${key}" trong ngôn ngữ "${lang}"`);
                missing++;
            }
        });
        console.log(`>>> Đã dịch: ${count} mục. Thiếu: ${missing} mục.`);
    }

    // --- CHẠY LẦN ĐẦU TIÊN ---
    // Đảm bảo giao diện đúng với ngôn ngữ đã lưu
    updateUI(currentLang);

    // --- SỰ KIỆN CHUYỂN ĐỔI NGÔN NGỮ ---
    if (langSwitch) {
        langSwitch.addEventListener('click', function() {
            // Logic đảo ngược ngôn ngữ đơn giản và an toàn
            // Nếu đang là 'vi' thì đổi sang 'en', ngược lại thì về 'vi'
            currentLang = (currentLang === 'vi') ? 'en' : 'vi';
            
            console.log(">>> Người dùng đổi sang:", currentLang);

            // Lưu lại (Luôn lưu chữ thường) - Lưu vào cả hai để tương thích
            localStorage.setItem('userLang', currentLang);
            localStorage.setItem('language', currentLang);

            // Cập nhật giao diện
            updateUI(currentLang);
            
            // Gọi changeLanguage từ base.html nếu có
            if (typeof changeLanguage === 'function') {
                changeLanguage(currentLang);
            }
        });
    } else {
        console.error("❌ LỖI: Không tìm thấy nút ID 'langSwitch' trong HTML");
    }

    // --- LOGIC VIEW MORE (Lazy Load) ---
    if (viewMoreBtn) {
        viewMoreBtn.addEventListener('click', function(e) {
            e.preventDefault();
            const hiddenCards = document.querySelectorAll('.hidden-card');
            hiddenCards.forEach(card => {
                card.classList.remove('hidden-card');
                card.style.display = 'block'; // Đảm bảo hiện ra
                card.animate([
                    { opacity: 0, transform: 'translateY(20px)' },
                    { opacity: 1, transform: 'translateY(0)' }
                ], { duration: 500, fill: 'forwards' });
            });
            
            // Sau khi hiện thẻ mới, chạy lại hàm dịch để đảm bảo thẻ mới cũng đúng ngôn ngữ
            updateUI(currentLang);
            
            viewMoreBtn.style.display = 'none';
        });
    }

    // --- XỬ LÝ CLICK VÀO CARD ĐỂ CHUYỂN ĐẾN FORM ---
    const cards = document.querySelectorAll('.card[data-destination]');
    cards.forEach(card => {
        card.addEventListener('click', function() {
            const destination = this.getAttribute('data-destination');
            if (destination) {
                // Encode URL đúng cách bằng JavaScript
                const encodedDestination = encodeURIComponent(destination);
                window.location.href = `/form?destination=${encodedDestination}`;
            }
        });
    });

    // --- SCROLL SPY: TỰ ĐỘNG ĐỔI ACTIVE STATE KHI SCROLL ---
    function updateActiveNavOnScroll() {
        const sections = {
            home: null, // Sẽ tính từ đầu trang
            featured: document.getElementById('featured'),
            contact: document.getElementById('contact')
        };

        // Chỉ chạy nếu đang ở trang home
        if (!sections.featured) return;

        const scrollPosition = window.scrollY + 150; // Offset cho header sticky

        // Lấy vị trí các section
        const homeEnd = sections.featured ? sections.featured.offsetTop - 100 : Infinity;
        const featuredStart = sections.featured ? sections.featured.offsetTop - 100 : Infinity;
        const featuredEnd = sections.contact ? sections.contact.offsetTop - 100 : Infinity;
        const contactStart = sections.contact ? sections.contact.offsetTop - 100 : Infinity;

        // Tìm tất cả nav links
        const navLinks = document.querySelectorAll('[data-nav-section]');
        
        // Xóa active class từ tất cả links
        navLinks.forEach(link => {
            link.classList.remove('active');
        });

        // Thêm active class cho link phù hợp
        if (scrollPosition < featuredStart) {
            // Ở phần home
            const homeLink = document.querySelector('[data-nav-section="home"]');
            if (homeLink) homeLink.classList.add('active');
        } else if (scrollPosition >= featuredStart && scrollPosition < featuredEnd) {
            // Ở phần featured (Gợi ý)
            const featuredLink = document.querySelector('[data-nav-section="featured"]');
            if (featuredLink) featuredLink.classList.add('active');
        } else if (scrollPosition >= contactStart) {
            // Ở phần contact
            const contactLink = document.querySelector('[data-nav-section="contact"]');
            if (contactLink) contactLink.classList.add('active');
        }
    }

    // Thêm event listener cho scroll (với debounce để tối ưu performance)
    let scrollTimeout;
    window.addEventListener('scroll', () => {
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(updateActiveNavOnScroll, 10);
    });

    // Gọi ngay khi trang load để set initial state
    updateActiveNavOnScroll();
});
// ==========================================================================
// [REPLACEMENT] BỘ QUẢN LÝ VIÊN NANG (CAPSULE) - PHIÊN BẢN ỔN ĐỊNH
// ==========================================================================
document.addEventListener('DOMContentLoaded', async function() {
    console.log(">>> [UI] Khởi động bộ quản lý Viên Nang...");

    // -----------------------------------------------------------
    // 1. XỬ LÝ OAUTH (FACEBOOK / GOOGLE) TRẢ VỀ TỪ URL
    // -----------------------------------------------------------
    const hash = window.location.hash;
    
    // Nếu phát hiện URL chứa Token (do FB/Google trả về)
    if (hash && hash.includes('access_token')) {
        const params = new URLSearchParams(hash.substring(1));
        const token = params.get('access_token');
        
        if (token) {
            console.log(">>> [OAUTH] Đã bắt được Token. Đang lưu...");
            
            // BƯỚC QUAN TRỌNG NHẤT: LƯU TOKEN NGAY LẬP TỨC
            localStorage.setItem('supa_token', token);
            
            // Xóa Token trên thanh địa chỉ cho đẹp (nhưng không reload)
            history.replaceState(null, null, ' '); 

            // Gửi Token về Backend để đồng bộ session (cho các tính năng cần session)
            // Không chờ kết quả, cứ chạy tiếp để vẽ UI cho nhanh
            fetch('/api/auth/sync-session', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ access_token: token })
            });
        }
    }

    // -----------------------------------------------------------
    // 2. KIỂM TRA & VẼ VIÊN NANG (CHẠY MỖI LẦN LOAD TRANG)
    // -----------------------------------------------------------
    const savedToken = localStorage.getItem('supa_token');

    if (savedToken) {
        // Nếu có Token trong kho -> Hỏi server xem Token của ai
        try {
            const res = await fetch('/api/get-capsule-info', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ access_token: savedToken })
            });
            
            // Nếu server trả về lỗi 401/500 -> Token hỏng
            if (!res.ok) throw new Error("Token hết hạn");
            
            const data = await res.json();

            if (data.success) {
                // Token ngon -> Vẽ viên nang
                drawCapsule(data.user);
            } else {
                // Token lởm -> Xóa đi
                console.log(">>> [UI] Token không hợp lệ. Đăng xuất.");
                localStorage.removeItem('supa_token');
            }
        } catch (e) {
            console.error("Lỗi xác thực Viên nang:", e);
            // Có thể xóa token nếu muốn chắc chắn: localStorage.removeItem('supa_token');
        }
    }

    // -----------------------------------------------------------
    // 3. HÀM VẼ GIAO DIỆN (UI)
    // -----------------------------------------------------------
    function drawCapsule(user) {
        // 1. Ẩn tất cả các nút đăng nhập/đăng ký cũ
        const selectors = [
            '.login-btn', '.register-btn', '.auth-buttons', 
            'a[href="/login"]', 'a[href="/register"]', 
            '#login-nav', '#guest-login-btn'
        ];
        selectors.forEach(sel => {
            document.querySelectorAll(sel).forEach(el => el.style.display = 'none');
        });
        
        // 2. Tìm vị trí chèn (Header)
        const headerRight = document.querySelector('.header-right') || document.querySelector('nav') || document.body;
        
        // 3. Xóa capsule cũ nếu lỡ có (tránh trùng lặp)
        const oldCap = document.getElementById('user-capsule-ui');
        if (oldCap) oldCap.remove();

        // 4. HTML Viên nang (Style chuẩn)
        const capsuleHTML = `
            <div id="user-capsule-ui" style="
                display: flex; align-items: center; gap: 10px; 
                background: rgba(30, 30, 30, 0.95); padding: 4px 15px 4px 4px; 
                border-radius: 50px; border: 1px solid rgba(255,255,255,0.2); 
                box-shadow: 0 4px 12px rgba(0,0,0,0.15); 
                margin-left: 15px; cursor: default; backdrop-filter: blur(5px);
                transition: transform 0.2s;
            ">
                <img src="${user.avatar}" style="
                    width: 34px; height: 34px; border-radius: 50%; 
                    object-fit: cover; border: 2px solid #3C7363;
                ">
                <div style="display: flex; flex-direction: column; line-height: 1.1;">
                    <span style="color: white; font-weight: bold; font-size: 13px; max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                        ${user.name}
                    </span>
                    <span style="color: #bbb; font-size: 10px;">Thành viên</span>
                </div>
                <button onclick="logoutCapsule()" style="
                    background: none; border: none; color: #ff5555; 
                    font-size: 16px; cursor: pointer; margin-left: 8px; 
                    padding: 4px; display: flex; align-items: center;
                    transition: transform 0.2s;
                " title="Đăng xuất" onmouseover="this.style.transform='scale(1.2)'" onmouseout="this.style.transform='scale(1)'">
                    <i class="fas fa-power-off"></i>
                </button>
            </div>
        `;
        
        headerRight.insertAdjacentHTML('beforeend', capsuleHTML);
    }

    // -----------------------------------------------------------
    // 4. HÀM ĐĂNG XUẤT TOÀN CỤC
    // -----------------------------------------------------------
    window.logoutCapsule = function() {
        if(confirm("Bạn có chắc muốn đăng xuất?")) {
            // Xóa sạch dấu vết
            localStorage.removeItem('supa_token');
            localStorage.removeItem('temp_login_email');
            
            // Báo backend (nếu cần) rồi reload
            fetch('/api/logout', {method: 'POST'})
                .finally(() => window.location.href = "/");
        }
    };
});
const API_BASE = window.location.origin;

document.addEventListener('DOMContentLoaded', function() {
    console.log(">>> AUTH JS LOADED. TARGET:", API_BASE);

    // Initialize language
    setTimeout(function() {
        if (typeof changeLanguage === 'function' && typeof getCurrentLanguage === 'function') {
            changeLanguage(getCurrentLanguage());
        }
    }, 100);

    // --- HÀM GỌI API CHUNG (ĐỂ TRÁNH LẶP CODE & BẮT LỖI TỐT HƠN) ---
    async function callAuthAPI(url, data, btn, successMsg) {
        const oldText = btn.textContent;
        btn.textContent = "Đang xử lý...";
        btn.disabled = true;

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            // Kiểm tra mã lỗi HTTP
            if (!response.ok) {
                const text = await response.text(); // Đọc text lỗi (HTML hoặc JSON lỗi)
                console.error("Server Error Body:", text);
                throw new Error(`Server Error: ${response.status} ${response.statusText}`);
            }

            const result = await response.json();

            if (result.success) {
                // --- [LOGIC MỚI] PHÂN LOẠI HÀNH ĐỘNG DỰA VÀO successMsg ---
                
                if (successMsg) {
                    // TRƯỜNG HỢP 1: ĐĂNG KÝ (Có tin nhắn thông báo)
                    Swal.fire({
                        title: 'Đăng ký thành công!',
                        text: successMsg,           // Dùng tin nhắn được truyền vào
                        icon: 'success',
                        timer: 2000,
                        showConfirmButton: false,
                        backdrop: `rgba(0,0,0,0.4)`
                    }).then(() => {
                        window.location.href = "/login"; // Chuyển về trang đăng nhập
                    });
                } else {
                    // TRƯỜNG HỢP 2: ĐĂNG NHẬP (successMsg là null)
                    Swal.fire({
                        title: 'Đăng nhập thành công!',
                        text: 'Đang chuyển hướng về trang chủ...',
                        icon: 'success',
                        timer: 1500,
                        showConfirmButton: false,
                        backdrop: `rgba(0,0,0,0.4)`
                    }).then(() => {
                        // Chuyển về Home (hoặc URL server trả về)
                        window.location.href = result.redirect_url || '/'; 
                    });
                }
                // -------------------------------------------------------
            } else {
                // (Giữ nguyên logic lỗi cũ)
                alert("Lỗi: " + (result.message || "Server không trả về lý do"));
            }

        } catch (error) {
            console.error("Network/Logic Error:", error);
            
            // [FIX] Phân loại lỗi để báo tin nhắn dễ hiểu hơn
            let msg = "Lỗi hệ thống: " + error.message;
            
            if (error.message.includes('Failed to fetch')) {
                msg = "Không thể kết nối đến Server. Vui lòng kiểm tra lại mạng hoặc đảm bảo Server Python đang chạy.";
            }

            // Dùng Swal nếu có, không thì alert
            if (typeof Swal !== 'undefined') {
                Swal.fire({
                    icon: 'error',
                    title: 'Lỗi kết nối',
                    text: msg,
                    confirmButtonColor: '#d33'
                });
            } else {
                alert(msg);
            }
        } finally {
            btn.textContent = oldText;
            btn.disabled = false;
        }
    }

    // 1. ĐĂNG KÝ
    const registerForm = document.querySelector('form');
    const isRegisterPage = document.getElementById('fullName');

    if (registerForm && isRegisterPage) {
        registerForm.addEventListener('submit', function(e) {
            e.preventDefault();
            const fullName = document.getElementById('fullName').value;
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            const confirm = document.getElementById('confirmPassword').value;
            
            if (password !== confirm) { 
                alert("Mật khẩu không khớp!"); 
                return; 
            }

            callAuthAPI(
                `${API_BASE}/api/register`, 
                { fullName, email, password }, 
                registerForm.querySelector('.submit-btn'),
                "Đăng ký thành công! Đăng nhập ngay."
            );
        });
    }

    // 2. ĐĂNG NHẬP
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', function(e) {
            e.preventDefault();
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;

            callAuthAPI(
                `${API_BASE}/api/login`, 
                { email, password }, 
                loginForm.querySelector('.submit-btn'),
                null // Không cần alert khi login thành công
            );
        });
        
        const link = document.querySelector('.already-account a');
        if(link) link.textContent = "Chưa có tài khoản? Đăng ký.";
    }

    // 3. KHÁCH
    const guestBtn = document.querySelector('[data-i18n="guestLogin"]');
    if (guestBtn) {
        guestBtn.addEventListener('click', function(e) {
            e.preventDefault();
            callAuthAPI(
                `${API_BASE}/api/login-guest`, 
                {}, 
                guestBtn,
                null
            );
        });
    }

    // Password toggle functionality
    document.querySelectorAll('.toggle-password').forEach(function(toggle) {
        toggle.addEventListener('click', function() {
            const targetId = this.getAttribute('data-target');
            let passwordInput = null;
            
            if (targetId) {
                passwordInput = document.getElementById(targetId);
            } else {
                const inputWrapper = this.closest('.input-wrapper');
                if (inputWrapper) {
                    passwordInput = inputWrapper.querySelector('input[type="password"], input[type="text"]');
                }
            }
            
            if (passwordInput) {
                if (passwordInput.type === 'password') {
                    passwordInput.type = 'text';
                    this.classList.remove('fa-eye-slash');
                    this.classList.add('fa-eye');
                } else {
                    passwordInput.type = 'password';
                    this.classList.remove('fa-eye');
                    this.classList.add('fa-eye-slash');
                }
            }
        });
    });

    // ============================================================
    // [CẬP NHẬT] CHUYỂN ĐỔI SANG REAL OAUTH2 (PRODUCTION MODE)
    // Code này sẽ ghi đè logic giả lập cũ khi người dùng bấm nút
    // ============================================================
    
    // Tìm lại các nút DOM
    const realGoogleBtns = document.querySelectorAll('.google-btn');
    const realFacebookBtns = document.querySelectorAll('.facebook-btn');

    function triggerRealOAuth(provider) {
        // Hiển thị loading nhẹ để người dùng biết đang chuyển trang
        if (typeof Swal !== 'undefined') {
            Swal.fire({
                title: 'Đang chuyển hướng...',
                text: `Đang kết nối tới ${provider === 'google' ? 'Google' : 'Facebook'}`,
                allowOutsideClick: false,
                didOpen: () => { Swal.showLoading(); }
            });
        }
        
        // Chuyển hướng trình duyệt sang route Python vừa viết
        // Route này sẽ lo việc đẩy sang Google/FB
        window.location.href = `${API_BASE}/api/login/${provider}`;
    }

    // Gán đè sự kiện onclick (Phương pháp này mạnh hơn addEventListener 
    // vì nó thay thế hoàn toàn hành vi cũ của element nếu gán trực tiếp)
    
    if (realGoogleBtns.length > 0) {
        realGoogleBtns.forEach(btn => {
            // Clone nút để xóa sạch các event listener cũ (nếu muốn chắc chắn 100%)
            // Hoặc gán onclick như sau để chạy song song/ưu tiên
            btn.onclick = function(e) {
                e.preventDefault();
                e.stopPropagation(); // Ngăn chặn event cũ
                triggerRealOAuth('google');
            };
        });
    }

    if (realFacebookBtns.length > 0) {
        realFacebookBtns.forEach(btn => {
            btn.onclick = function(e) {
                e.preventDefault();
                e.stopPropagation();
                triggerRealOAuth('facebook');
            };
        });
    }
});

// Login page specific translations
if (window.translations) {
    window.translations.vi = window.translations.vi || {};
    window.translations.en = window.translations.en || {};
    
    Object.assign(window.translations.vi, {
        title: "Khám phá hành trình",
        subtitle: "hoàn hảo của bạn.",
        fullName: "Họ và Tên",
        fullNamePlaceholder: "Nhập họ và tên",
        email: "Email",
        emailPlaceholder: "Nhập email",
        password: "Mật Khẩu",
        passwordPlaceholder: "Nhập mật khẩu",
        confirmPassword: "Nhập lại mật khẩu",
        confirmPasswordPlaceholder: "Nhập lại mật khẩu",
        or: "Hoặc",
        guestLogin: "Đăng nhập với tài khoản khách",
        signUp: "Đăng Ký",
        login: "Đăng Nhập",
        haveAccount: "Đã có tài khoản."
    });
    
    Object.assign(window.translations.en, {
        title: "Discover Your",
        subtitle: "Perfect Journey.",
        fullName: "Full Name",
        fullNamePlaceholder: "Enter your full name",
        email: "Email",
        emailPlaceholder: "Enter your email",
        password: "Password",
        passwordPlaceholder: "Enter your password",
        confirmPassword: "Confirm Password",
        confirmPasswordPlaceholder: "Confirm your password",
        or: "Or",
        guestLogin: "Login as guest",
        signUp: "Sign Up",
        login: "Login",
        haveAccount: "Already have an account."
    });
}
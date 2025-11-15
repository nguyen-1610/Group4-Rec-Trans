// Login page specific translations - extend base translations
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
        haveAccount: "Already have an account."
    });
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Update language for login page specific translations
    if (typeof changeLanguage === 'function') {
        changeLanguage(getCurrentLanguage());
    }

    // Password toggle functionality
    document.querySelectorAll('.toggle-password').forEach(function(toggle) {
        toggle.addEventListener('click', function() {
            // Lấy input tương ứng từ data-target attribute
            const targetId = this.getAttribute('data-target');
            const passwordInput = document.getElementById(targetId);
            
            if (passwordInput) {
                // Toggle giữa password và text
                if (passwordInput.type === 'password') {
                    passwordInput.type = 'text';
                    // Đổi icon từ eye-slash sang eye
                    this.classList.remove('fa-eye-slash');
                    this.classList.add('fa-eye');
                } else {
                    passwordInput.type = 'password';
                    // Đổi icon từ eye sang eye-slash
                    this.classList.remove('fa-eye');
                    this.classList.add('fa-eye-slash');
                }
            }
        });
    });

});


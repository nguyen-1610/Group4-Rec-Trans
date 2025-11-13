const rangeSlider = document.querySelector('.range-slider');
const budgetValue = document.querySelector('.budget-value');
const dropdownHeader = document.querySelector('.dropdown-header');
const dropdownContent = document.querySelector('.dropdown-content');
const addPreferenceBtn = document.querySelector('.add-preference');
const submitBtn = document.querySelector('.submit-btn');

// Hàm format số tiền
function formatCurrency(value) {
    return 'đ0-' + value.toLocaleString('vi-VN');
}

// Cập nhật giá trị khi kéo slider
rangeSlider.addEventListener('input', (e) => {
    const value = parseInt(e.target.value);
    budgetValue.textContent = formatCurrency(value);
});

// Set giá trị ban đầu
budgetValue.textContent = formatCurrency(parseInt(rangeSlider.value));

// Toggle dropdown (thu/mở)
dropdownHeader.addEventListener('click', () => {
    dropdownContent.classList.toggle('hidden');
    dropdownHeader.classList.toggle('collapsed');
});

// Thêm ưu tiên mới
addPreferenceBtn.addEventListener('click', () => {
    const preferenceName = prompt('Nhập tên ưu tiên mới:');
    
    if (preferenceName && preferenceName.trim() !== '') {
        // Tạo item mới
        const newItem = document.createElement('div');
        newItem.className = 'checkbox-item';
        newItem.innerHTML = `
            <span>${preferenceName.trim()}</span>
            <input type="checkbox">
        `;
        
        // Thêm vào trước nút "Thêm"
        dropdownContent.insertBefore(newItem, addPreferenceBtn);
    }
});

// Chuyển sang trang chatbot khi bấm Hoàn tất
submitBtn.addEventListener('click', () => {
    // Nếu file chatbot.html cùng thư mục
    window.location.href = 'chatbot.html';
    
    // Hoặc nếu theo cấu trúc của bạn: ../static/html/chatbot.html
    // window.location.href = '../static/html/chatbot.html';
});
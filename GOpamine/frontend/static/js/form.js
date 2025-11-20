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

submitBtn.addEventListener('click', async () => {
    // Thu thập dữ liệu form
    const formData = {
        origin: document.querySelector('input[placeholder="Tìm kiếm"]').value,
        destination: document.querySelectorAll('input[placeholder="Tìm kiếm"]')[1].value,
        budget: rangeSlider.value,
        passengers: document.querySelector('input[placeholder="Số hành khách"]').value,
        age: document.querySelector('input[placeholder="Tuổi"]').value,
        preferences: Array.from(document.querySelectorAll('.checkbox-item input:checked'))
            .map(cb => cb.parentElement.querySelector('span').textContent)
    };

    // Lấy session ID từ localStorage (hoặc tạo mới)
    let sessionId = localStorage.getItem('sessionId');
    
    if (!sessionId) {
        // Tạo session mới
        const response = await fetch('http://localhost:5000/api/session', {
            method: 'POST'
        });
        const data = await response.json();
        sessionId = data.session_id;
        localStorage.setItem('sessionId', sessionId);
    }

    // Gửi form data đến backend
    await fetch('http://localhost:5000/api/form', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            session_id: sessionId,
            form_data: formData
        })
    });

    // Chuyển sang trang chatbot
    window.location.href = 'chatbot.html';
});
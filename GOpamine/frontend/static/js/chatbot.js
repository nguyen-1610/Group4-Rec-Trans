const chatInput = document.querySelector('.chat-input');
const sendBtn = document.querySelector('.send-btn');
const chatContainer = document.querySelector('.chat-container');
const addBtn = document.querySelector('.add-btn');
const suggestionsContainer = document.querySelector('.suggestions-container');
const suggestionBtns = document.querySelectorAll('.suggestion-btn');

// Lưu session ID
let sessionId = null;

// ========================================
// QUAN TRỌNG: Lấy session ID từ form
// ========================================
async function initSession() {
    try {
        // Kiểm tra xem có session từ form không
        const existingSessionId = localStorage.getItem('sessionId');
        
        if (existingSessionId) {
            // Dùng session có sẵn từ form
            sessionId = existingSessionId;
            console.log('✅ Sử dụng session từ form:', sessionId);
            
            // Hiển thị message chào mừng với context
            showWelcomeMessage();
        } else {
            // Tạo session mới nếu user vào trực tiếp chatbot
            console.log('🆕 Tạo session mới...');
            const response = await fetch('http://localhost:5000/api/session', {
                method: 'POST'
            });
            const data = await response.json();
            sessionId = data.session_id;
            localStorage.setItem('sessionId', sessionId);
            console.log('✅ Session created:', sessionId);
        }
    } catch (error) {
        console.error('❌ Error creating session:', error);
        alert('Không thể kết nối đến server. Vui lòng kiểm tra backend!');
    }
}

// Hiển thị message chào mừng khi có form data
function showWelcomeMessage() {
    // Bạn có thể thêm message chào đặc biệt ở đây nếu muốn
    console.log('👋 User đã điền form, sẵn sàng chat với context');
}

// Gọi khi load trang
initSession();

// Toggle suggestions
addBtn.addEventListener('click', () => {
    suggestionsContainer.classList.toggle('active');
    addBtn.classList.toggle('active');
});

// Handle suggestion button clicks
suggestionBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        chatInput.value = btn.textContent;
        suggestionsContainer.classList.remove('active');
        addBtn.classList.remove('active');
        chatInput.focus();
    });
});

async function sendMessage() {
    const message = chatInput.value.trim();
    if (message === '' || !sessionId) {
        if (!sessionId) {
            alert('Đang kết nối... Vui lòng thử lại!');
        }
        return;
    }

    // Thêm tin nhắn người dùng
    const userMessage = document.createElement('div');
    userMessage.className = 'user-message';
    userMessage.innerHTML = `<div class="user-bubble">${escapeHtml(message)}</div>`;
    chatContainer.appendChild(userMessage);

    // Xóa nội dung input
    chatInput.value = '';

    // Cuộn xuống cuối
    chatContainer.scrollTop = chatContainer.scrollHeight;
    
    // Ẩn suggestions nếu đang mở
    suggestionsContainer.classList.remove('active');
    addBtn.classList.remove('active');

    // Hiển thị typing indicator
    const typingIndicator = document.createElement('div');
    typingIndicator.className = 'bot-message typing-indicator';
    typingIndicator.innerHTML = `
        <div class="bot-avatar">🤖</div>
        <div class="message-bubble">Đang suy nghĩ...</div>
    `;
    chatContainer.appendChild(typingIndicator);
    chatContainer.scrollTop = chatContainer.scrollHeight;

    try {
        console.log('📤 Sending message:', message);
        
        // Gửi request đến backend
        const response = await fetch('http://localhost:5000/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                session_id: sessionId,
                message: message
            })
        });

        // Xóa typing indicator
        typingIndicator.remove();

        if (!response.ok) {
            throw new Error(`Server error: ${response.status}`);
        }

        const data = await response.json();
        console.log('✅ Received response:', data);

        // Hiển thị response từ bot
        const botMessage = document.createElement('div');
        botMessage.className = 'bot-message';
        botMessage.innerHTML = `
            <div class="bot-avatar">🤖</div>
            <div class="message-bubble">${escapeHtml(data.response)}</div>
        `;
        chatContainer.appendChild(botMessage);
        chatContainer.scrollTop = chatContainer.scrollHeight;

    } catch (error) {
        console.error('❌ Error sending message:', error);
        
        // Xóa typing indicator
        typingIndicator.remove();
        
        // Hiển thị lỗi
        const errorMessage = document.createElement('div');
        errorMessage.className = 'bot-message';
        errorMessage.innerHTML = `
            <div class="bot-avatar">🤖</div>
            <div class="message-bubble" style="background: #ffebee; color: #c62828;">
                ❌ Xin lỗi, đã có lỗi xảy ra: ${error.message}<br>
                Vui lòng kiểm tra kết nối và thử lại!
            </div>
        `;
        chatContainer.appendChild(errorMessage);
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }
}

// Helper function để escape HTML (tránh XSS)
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

sendBtn.addEventListener('click', sendMessage);
chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendMessage();
    }
});
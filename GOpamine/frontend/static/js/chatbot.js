const chatInput = document.querySelector('.chat-input');
const sendBtn = document.querySelector('.send-btn');
const chatContainer = document.querySelector('.chat-container');
const addBtn = document.querySelector('.add-btn');
const suggestionsContainer = document.querySelector('.suggestions-container');
const suggestionBtns = document.querySelectorAll('.suggestion-btn');

// Lưu session ID
let sessionId = null;
const CHAT_HISTORY_PREFIX = 'chatHistory:';
let historyKey = null;

function getHistoryKey(session) {
    return session ? `${CHAT_HISTORY_PREFIX}${session}` : null;
}

function prepareChatHistory(session, reset = false) {
    historyKey = getHistoryKey(session);
    if (!historyKey) return;
    
    if (reset) {
        localStorage.removeItem(historyKey);
    }
    
    restoreChatHistory();
}

function restoreChatHistory() {
    if (!historyKey) return;
    
    try {
        const historyRaw = localStorage.getItem(historyKey);
        if (!historyRaw) return;
        
        const history = JSON.parse(historyRaw);
        history.forEach(entry => {
            if (!entry?.role || !entry?.content) return;
            if (entry.role === 'user') {
                appendUserMessage(entry.content, false);
            } else if (entry.role === 'bot') {
                appendBotMessage(entry.content, false);
            }
        });
    } catch (error) {
        console.warn('Không thể khôi phục lịch sử chat:', error);
    }
}

function persistMessage(role, content) {
    if (!historyKey || !role || typeof content !== 'string') return;
    
    try {
        const history = JSON.parse(localStorage.getItem(historyKey) || '[]');
        history.push({ role, content });
        localStorage.setItem(historyKey, JSON.stringify(history));
    } catch (error) {
        console.warn('Không thể lưu lịch sử chat:', error);
    }
}

// ========================================
// QUAN TRỌNG: Lấy session ID từ form
// ========================================
async function initSession(forceNew = false) {
    try {
        // Kiểm tra xem có session từ form không
        const existingSessionId = !forceNew ? localStorage.getItem('sessionId') : null;
        
        if (existingSessionId) {
            // Dùng session có sẵn từ form
            sessionId = existingSessionId;
            console.log('✅ Sử dụng session từ form:', sessionId);
            
            prepareChatHistory(sessionId);
            
            // Hiển thị message chào mừng với context
            showWelcomeMessage();
            return true;
        } else {
            // Tạo session mới nếu user vào trực tiếp chatbot
            console.log('🆕 Tạo session mới...');
            const response = await fetch('/api/session', {
                method: 'POST'
            });
            const data = await response.json();
            sessionId = data.session_id;
            localStorage.setItem('sessionId', sessionId);
            prepareChatHistory(sessionId, true);
            console.log('✅ Session created:', sessionId);
            return true;
        }
    } catch (error) {
        console.error('❌ Error creating session:', error);
        alert('Không thể kết nối đến server. Vui lòng kiểm tra backend!');
        return false;
    }
}

async function recreateSession() {
    if (historyKey) {
        localStorage.removeItem(historyKey);
    }
    localStorage.removeItem('sessionId');
    sessionId = null;
    historyKey = null;
    console.warn('⚠️ Session invalid, creating a fresh one...');
    return initSession(true);
}

// Hiển thị message chào mừng khi có form data
function showWelcomeMessage() {
    // Bạn có thể thêm message chào đặc biệt ở đây nếu muốn
    console.log('👋 User đã điền form, sẵn sàng chat với context');
}

// Tạo prompt tự động dựa trên form data
function generateAutoPrompt(formData) {
    let prompt = "Tôi muốn được tư vấn về lộ trình di chuyển. ";
    
    if (formData.origin) {
        const originName = typeof formData.origin === 'string'
            ? formData.origin
            : formData.origin.name || '';
        if (originName) {
            prompt += `Điểm xuất phát của tôi là ${originName}. `;
        }
    }
    
    if (formData.destinations && formData.destinations.length > 0) {
        const destNames = formData.destinations
            .map(dest => typeof dest === 'string' ? dest : dest.name)
            .filter(Boolean);
        
        if (destNames.length === 1) {
            prompt += `Tôi muốn đi đến ${destNames[0]}. `;
        } else if (destNames.length > 1) {
            prompt += `Tôi muốn đi đến các điểm sau: ${destNames.join(', ')}. `;
        } else {
            prompt += `Tôi chưa xác định điểm đến cụ thể. `;
        }
    }
    
    if (formData.budget) {
        const budgetNum = parseInt(formData.budget);
        if (budgetNum > 0) {
            prompt += `Ngân sách của tôi là ${budgetNum.toLocaleString('vi-VN')} VNĐ. `;
        }
    }
    
    if (formData.passengers) {
        prompt += `Số hành khách là ${formData.passengers} người. `;
    }
    
    if (formData.preferences && formData.preferences.length > 0) {
        prompt += `Ưu tiên của tôi là: ${formData.preferences.join(', ')}. `;
    }
    
    prompt += "Bạn có thể tư vấn cho tôi phương tiện và lộ trình phù hợp nhất không?";
    
    return prompt;
}

// Tự động gửi prompt khi có form data
async function sendAutoPrompt() {
    try {
        const pendingFormDataStr = localStorage.getItem('pendingFormData');
        if (!pendingFormDataStr) {
            return; // Không có form data, không làm gì
        }
        
        const formData = JSON.parse(pendingFormDataStr);
        console.log('📋 Phát hiện form data, tạo prompt tự động...');
        
        // Xóa form data khỏi localStorage để không gửi lại lần sau
        localStorage.removeItem('pendingFormData');
        
        // Tạo prompt tự động
        const autoPrompt = generateAutoPrompt(formData);
        console.log('Auto prompt:', autoPrompt);
        
        // Đợi một chút để đảm bảo session đã sẵn sàng
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Gửi prompt như tin nhắn của user
        if (sessionId) {
            // Gửi prompt ngầm đến backend để bot phản hồi chủ động
            await sendMessageToBackend(autoPrompt);
        }
    } catch (error) {
        console.error('❌ Error sending auto prompt:', error);
    }
}

// Hàm gửi message đến backend (tách riêng để tái sử dụng)
async function sendMessageToBackend(message, allowRetry = true) {
    if (!sessionId || !message) return;
    
    // Hiển thị typing indicator
    const typingIndicator = document.createElement('div');
    typingIndicator.className = 'bot-message typing-indicator';
    typingIndicator.innerHTML = `
        <div class="bot-avatar">
            <img src="../static/image/logo.jpg" alt="bot-avatar" >
        </div>
        <div class="message-bubble">Đang suy nghĩ...</div>
    `;
    chatContainer.appendChild(typingIndicator);
    chatContainer.scrollTop = chatContainer.scrollHeight;
    
    try {
        console.log('📤 Sending message:', message);
        
        const response = await fetch('/api/chat', {
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
            let errorDetails = null;
            try {
                errorDetails = await response.json();
            } catch (_) {
                // ignore JSON parsing errors
            }

            // Nếu server báo session không hợp lệ (ví dụ backend restart) thì tạo session mới và thử lại
            if (
                allowRetry &&
                response.status === 400 &&
                errorDetails &&
                errorDetails.error === 'Invalid session'
            ) {
                const recreated = await recreateSession();
                if (recreated) {
                    return sendMessageToBackend(message, false);
                }
            }

            const serverMsg = errorDetails?.error ? ` - ${errorDetails.error}` : '';
            throw new Error(`Server error: ${response.status}${serverMsg}`);
        }
        
        const data = await response.json();
        console.log('✅ Received response:', data);
        
        appendBotMessage(data.response);
        
    } catch (error) {
        console.error('❌ Error sending message:', error);
        
        // Xóa typing indicator
        typingIndicator.remove();
        
        // Hiển thị lỗi
        const errorMessage = document.createElement('div');
        errorMessage.className = 'bot-message';
        errorMessage.innerHTML = `
            <div class="bot-avatar">
                <img src="../static/image/logo.jpg" alt="bot-avatar" >
            </div>
            <div class="message-bubble" style="background: #ffebee; color: #c62828;">
                ❌ Xin lỗi, đã có lỗi xảy ra: ${error.message}<br>
                Vui lòng kiểm tra kết nối và thử lại!
            </div>
        `;
        chatContainer.appendChild(errorMessage);
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }
}

// Gọi khi load trang
initSession().then(() => {
    // Sau khi init session xong, kiểm tra và gửi auto prompt
    sendAutoPrompt();
});

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

function scrollChatToBottom() {
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

function appendUserMessage(message, persist = true) {
    const userMessage = document.createElement('div');
    userMessage.className = 'user-message';
    userMessage.innerHTML = `<div class="user-bubble">${escapeHtml(message)}</div>`;
    chatContainer.appendChild(userMessage);
    scrollChatToBottom();
    
    if (persist) {
        persistMessage('user', message);
    }
}

function appendBotMessage(message, persist = true) {
    const botMessage = document.createElement('div');
    botMessage.className = 'bot-message';
    botMessage.innerHTML = `
        <div class="bot-avatar">
            <img src="../static/image/logo.jpg" alt="bot-avatar" >
        </div>
        <div class="message-bubble">${formatBotResponse(message)}</div>
    `;
    chatContainer.appendChild(botMessage);
    scrollChatToBottom();
    
    if (persist) {
        persistMessage('bot', message);
    }
}

async function sendMessage() {
    const message = chatInput.value.trim();
    if (message === '' || !sessionId) {
        if (!sessionId) {
            alert('Đang kết nối... Vui lòng thử lại!');
        }
        return;
    }

    // Thêm tin nhắn người dùng
    appendUserMessage(message);

    // Xóa nội dung input
    chatInput.value = '';

    // Ẩn suggestions nếu đang mở
    suggestionsContainer.classList.remove('active');
    addBtn.classList.remove('active');

    // Gửi message đến backend
    await sendMessageToBackend(message);
}

// Helper function để escape HTML (tránh XSS)
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Format bot response để xuống dòng, in đậm, bullet…
function formatBotResponse(rawText) {
    if (!rawText) return '';
    
    const escaped = escapeHtml(rawText.trim());
    const lines = escaped.split('\n');
    let html = '';
    let listBuffer = [];
    
    const flushList = () => {
        if (listBuffer.length === 0) return;
        html += '<ul>';
        listBuffer.forEach(item => {
            html += `<li>${formatInlineMarkdown(item)}</li>`;
        });
        html += '</ul>';
        listBuffer = [];
    };
    
    lines.forEach(line => {
        const trimmed = line.trim();
        
        if (trimmed === '') {
            flushList();
            html += '<br>';
            return;
        }
        
        if (/^[-*]\s+/.test(trimmed)) {
            listBuffer.push(trimmed.replace(/^[-*]\s+/, ''));
            return;
        }
        
        flushList();
        html += `<p>${formatInlineMarkdown(trimmed)}</p>`;
    });
    
    flushList();
    return html || escaped;
}

// Chỉ xử lý một số Markdown cơ bản (bold/italic)
function formatInlineMarkdown(text) {
    if (!text) return '';
    return text
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>');
}

sendBtn.addEventListener('click', sendMessage);
chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendMessage();
    }
});

// Điều hướng giữa chatbot và map, nút back
function setupHeaderNavigation() {
    const backBtn = document.querySelector('.back-btn');
    const toggleBtns = document.querySelectorAll('.toggle-btn');
    
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            // Quay về trang trước đó trong lịch sử trình duyệt
            window.history.back();
        });
    }
    
    if (toggleBtns.length > 0) {
        toggleBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                toggleBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                if (btn.dataset.target === 'map') {
                    window.location.href = '/map_trans';
                }
            });
        });
    }
}

setupHeaderNavigation();
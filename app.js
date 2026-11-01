// ================== НАСТРОЙКИ SUPABASE ==================
const SUPABASE_URL = "https://lxfkjjctsrakayzqyiac.supabase.co";
const SUPABASE_KEY = "sb_publishable_zMxBVM29AeqCja0GdMGJ5g_CKPJmGgf";
// ========================================================
// Мягкая проверка объекта Telegram
const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;

if (tg) {
    tg.ready();
    tg.expand();
}

// Проверяем, загрузилась ли библиотека Supabase
let supabase = null;
if (typeof supabase !== 'undefined' && supabase.createClient) {
    supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
} else if (window.supabase && window.supabase.createClient) {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
}

// Безопасно вытаскиваем ID пользователя
const user = tg ? tg.initDataUnsafe?.user : null;
const userId = user ? user.id : 123456789; // Тестовый ID для ПК
const username = user ? (user.username || user.first_name) : "Тестовый_Юзер";

let playerPoints = 0;
let lastPackOpened = null;
const PACK_COOLDOWN_MS = 4 * 60 * 60 * 1000;

document.addEventListener("DOMContentLoaded", async () => {
    // Если Supabase не загрузился из сети, пишем ошибку вместо вечной загрузки
    if (!supabase) {
        console.error("Ошибка: библиотека Supabase не была загружена!");
        const timerText = document.getElementById('time-left');
        if (timerText) timerText.textContent = "Ошибка сети";
        return;
    }
    
    await loadOrCreatePlayer();
    initGameLogic();
    setInterval(updateTimerDisplay, 1000);
});

// 1. Загрузка данных игрока или создание, если его нет
async function loadOrCreatePlayer() {
    // Ищем игрока в вашей таблице "players"
    let { data: player, error } = await supabase
        .from('players')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

    if (!player) {
        // Если зашел новый игрок, регистрируем его как в боте
        const { data: newPlayer } = await supabase
            .from('players')
            .insert({ user_id: userId, username: username, points: 0, affinity: 0 })
            .select()
            .single();
        player = newPlayer;
    }

    if (player) {
        playerPoints = player.points;
        lastPackOpened = player.last_pack_opened;
        
        // Обновляем визуальный баланс монет под ваш CSSкласс (.coin-balance)
        updateCoinsDisplay(playerPoints);
        // Обновляем шкалу лояльности/отношения
        updateAffinityBar(player.affinity);
    }
}

// Обновление текста баланса
function updateCoinsDisplay(points) {
    const coinBlock = document.querySelector('.coin-balance');
    if (coinBlock) {
        coinBlock.innerHTML = `<img src="assets/coins_pile.png" class="icon-coins"> ${points} 🪙`;
    }
}

// Обновление полоски лояльности
function updateAffinityBar(affinityValue) {
    const fill = document.querySelector('.affinity-bar-fill');
    const header = document.querySelector('.affinity-header span:last-child'); // Текст процента
    if (fill) fill.style.width = `${Math.min(100, Math.max(0, affinityValue))}%`;
    if (header) header.textContent = `${affinityValue}%`;
}

// 2. Логика работы таймера кулдауна
function getRemainingTime() {
    if (!lastPackOpened) return 0;
    // Приводим дату из Supabase к миллисекундам
    const lastTime = new Date(lastPackOpened).getTime();
    const now = new Date().getTime();
    const timePassed = now - lastTime;
    const timeLeft = PACK_COOLDOWN_MS - timePassed;
    return timeLeft > 0 ? timeLeft : 0;
}

function updateTimerDisplay() {
    const timerText = document.getElementById('time-left');
    if (!timerText) return;

    const timeLeft = getRemainingTime();
    if (timeLeft <= 0) {
        timerText.textContent = "00ч 00м 00с";
        return;
    }

    // Рассчитываем часы, минуты и секунды
    const hours = Math.floor(timeLeft / (1000 * 60 * 60));
    const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000);

    const pad = (num) => String(num).padStart(2, '0');
    timerText.textContent = `${pad(hours)}ч ${pad(minutes)}м ${pad(seconds)}с`;
}

// 3. Интерактив: Нажатие на Магический круг и вызов карт
function initGameLogic() {
    // Предположим, у вас есть элемент круга, на который кликают. Добавим клик на всю зону сброса
    const ringZone = document.querySelector('.magic-ring-container');
    
    if (ringZone) {
        ringZone.style.cursor = 'pointer';
        ringZone.addEventListener('click', () => {
            handlePullCard();
        });
    }

    // Кнопка покупки часа за 20 монет
    const buyHourBtn = document.querySelector('.btn-buy-hour');
    if (buyHourBtn) {
        buyHourBtn.addEventListener('click', () => {
            handleBuyHour();
        });
    }
}

// Функция вытягивания карты
async function handlePullCard() {
    // Проверяем время ожидания
    if (getRemainingTime() > 0) {
        tg.showAlert("Рано! Магия еще не восстановилась. Жди таймер!");
        return;
    }

    // Запускаем анимацию переворота песочных часов, если нашли их
    const hourglass = document.querySelector('.icon-hourglass');
    if (hourglass) {
        hourglass.classList.add('flip-hourglass');
        setTimeout(() => hourglass.classList.remove('flip-hourglass'), 1000);
    }

    const nowIso = new Date().toISOString();

    // Обновляем время в базе данных
    const { error } = await supabase
        .from('players')
        .update({ last_pack_opened: nowIso })
        .eq('user_id', userId);

    if (!error) {
        lastPackOpened = nowIso;
        tg.HapticFeedback.notificationOccurred("success"); // Легкая вибрация телефона
        
        // Тут запускается ваш код отрисовки карт в .cards-drop-zone
        spawnCardVisual(); 
    }
}

// Функция покупки минус 1 часа
async function handleBuyHour() {
    if (getRemainingTime() <= 0) {
        tg.showAlert("Таймер уже истек, платить нет смысла!");
        return;
    }
    if (playerPoints < 20) {
        tg.showAlert("Недостаточно монет! Нужно 20 🪙.");
        return;
    }

    // Сдвигаем время на 1 час назад
    const currentLastOpened = new Date(lastPackOpened);
    currentLastOpened.setHours(currentLastOpened.getHours() - 1);
    
    const newPoints = playerPoints - 20;

    const { error } = await supabase
        .from('players')
        .update({ 
            points: newPoints, 
            last_pack_opened: currentLastOpened.toISOString() 
        })
        .eq('user_id', userId);

    if (!error) {
        playerPoints = newPoints;
        lastPackOpened = currentLastOpened.toISOString();
        updateCoinsDisplay(playerPoints);
        tg.HapticFeedback.impactOccurred("medium");
    }
}

// Заглушка для рендера выпавшей карты (под ваши стили .card-container)
function spawnCardVisual() {
    const dropZone = document.querySelector('.cards-drop-zone');
    if (!dropZone) return;

    dropZone.innerHTML = ""; // Очищаем старые карты

    // Создаем структуру карты из вашего CSS
    const cardHtml = `
        <div class="card-container">
            <div class="card-inner">
                <div class="card-front"></div>
                <div class="card-back">
                    <img class="card-image-bg" src="assets/deck_texture.png">
                    <div class="card-content">
                        <div class="card-title">СЛУЧАЙНАЯ КАРТА</div>
                        <div class="card-rarity">ОБЫЧНАЯ</div>
                    </div>
                </div>
            </div>
        </div>
    `;

    dropZone.innerHTML = cardHtml;

    // Через долю секунды добавляем класс анимации переворота карты
    setTimeout(() => {
        const card = dropZone.querySelector('.card-container');
        if (card) card.classList.add('flipped');
    }, 300);
}

// Инициализация Telegram WebApp и получение никнейма игрока
const playerUserElement = document.getElementById('player-user');
if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initDataUnsafe?.user) {
    window.Telegram.WebApp.ready();
    window.Telegram.WebApp.expand();
    const tgUser = window.Telegram.WebApp.initDataUnsafe.user;
    if (playerUserElement) playerUserElement.innerText = tgUser.username ? `@${tgUser.username}` : tgUser.first_name;
}

// Глобальные переменные экономики, лояльности и времени
let playerCoins = 120; 
let playerAffinity = 45; // Лояльность в %
let cooldownSeconds = 2 * 3600 + 15 * 60; // 02ч 15м
let timerInterval = null;

const coinCountElement = document.getElementById('coin-count');
const timeLeftElement = document.getElementById('time-left');
const buyHourBtn = document.querySelector('.btn-buy-hour');

function formatTime(totalSeconds) {
    if (totalSeconds <= 0) return "Можно тянуть!";
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const hStr = hours < 10 ? '0' + hours : hours;
    const mStr = minutes < 10 ? '0' + minutes : minutes;
    const sStr = seconds < 10 ? '0' + seconds : seconds;
    return `${hStr}ч ${mStr}м ${sStr}с`;
}

function startTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timeLeftElement.innerText = formatTime(cooldownSeconds);
    
    // Функция updateCardsAvailability находится в соседнем файле cards.js, вызываем её безопасно
    if (typeof updateCardsAvailability === 'function') updateCardsAvailability();

    const hourglassImg = document.querySelector('.icon-hourglass');

    timerInterval = setInterval(() => {
        if (cooldownSeconds > 0) {
            cooldownSeconds--;
            timeLeftElement.innerText = formatTime(cooldownSeconds);
            if (cooldownSeconds % 60 === 0 && hourglassImg) {
                hourglassImg.classList.toggle('flip-hourglass');
            }
        } else {
            clearInterval(timerInterval);
            timeLeftElement.innerText = "Можно тянуть!";
            if (typeof updateCardsAvailability === 'function') updateCardsAvailability();
        }
    }, 1000);
}

function buyCooldownReduction() {
    const REDUCTION_COST = 20;
    const REDUCTION_TIME = 3600; 
    if (cooldownSeconds <= 0) return;
    
    if (playerCoins < REDUCTION_COST) {
        alert(`Тебе не хватает монет.`);
        return;
    }
    
    const hourglassImg = document.querySelector('.icon-hourglass');
    if (hourglassImg) hourglassImg.classList.toggle('flip-hourglass');
    
    playerCoins -= REDUCTION_COST;
    cooldownSeconds = Math.max(0, cooldownSeconds - REDUCTION_TIME);
    coinCountElement.innerText = playerCoins;
    timeLeftElement.innerText = formatTime(cooldownSeconds);

    // Меняем фразу бота (функция из соседнего файла)
    if (typeof changeBotSpeech === 'function' && typeof BOT_PHRASES !== 'undefined') {
        changeBotSpeech(BOT_PHRASES.buy_hour);
    }

    if (cooldownSeconds <= 0) {
        clearInterval(timerInterval);
        if (typeof updateCardsAvailability === 'function') updateCardsAvailability();
    }
}

// Функция обновления шкалы лояльности на экране
function updateAffinityUI() {
    const affPercent = document.getElementById('affinity-percent');
    const affFill = document.getElementById('affinity-fill');
    if (affPercent) affPercent.innerText = `${playerAffinity}%`;
    if (affFill) affFill.style.width = `${playerAffinity}%`;
}

// Запуск системных механик при загрузке
window.addEventListener('DOMContentLoaded', () => {
    if (coinCountElement) coinCountElement.innerText = playerCoins;
    updateAffinityUI();
    if (buyHourBtn) buyHourBtn.addEventListener('click', buyCooldownReduction);
    startTimer();
// Запуск системных механик при загрузке
window.addEventListener('DOMContentLoaded', () => {
    if (coinCountElement) coinCountElement.innerText = playerCoins;
    updateAffinityUI();
    if (buyHourBtn) buyHourBtn.addEventListener('click', buyCooldownReduction);
    startTimer();

    // --- ЛОГИКА АВТОНОМНОГО РАСПИСАНИЯ БОТА ---
    function setupBotNextQuestion() {
        // Задаем случайное время для следующего вопроса бота
        // Для теста: от 30 000 мс (30 сек) до 120 000 мс (2 мин)
        // В будущем здесь можно поставить часы/минуты, как в оригинале
        const minTime = 30000; 
        const maxTime = 120000;
        const randomDelay = Math.floor(Math.random() * (maxTime - minTime + 1)) + minTime;

        setTimeout(() => {
            // Проверяем, открыт ли сейчас экран колоды или модалка награды. 
            // Если игрок занят, кнопки появятся на фоне и не помешают, но лучше подождем, пока он на главном экране
            const isModalOpen = cardModal && cardModal.style.display === 'flex';
            const isDeckOpen = deckScreen && deckScreen.style.display === 'flex';

            if (!isModalOpen && !isDeckOpen) {
                // Если игрок на главном экране, вызываем опрос из файла cards.js
                if (typeof triggerRandomQuiz === 'function') {
                    triggerRandomQuiz();
                }
            }

            // Как только этот опрос сработал (или пропустили шаг), 
            // бот сразу планирует в голове СЛЕДУЮЩИЙ случайный вопрос по расписанию
            setupBotNextQuestion();

        }, randomDelay);
    }

    // Запускаем расписание бота через 20 секунд после первого старта игры
    setTimeout(setupBotNextQuestion, 20000);
});


});

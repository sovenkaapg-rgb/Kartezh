import { playerProfile, apiFetch, haptic, toast, DOM } from './config.js';

// Набор символов
const SYMBOLS = ['☿', '♀', '♁', '♂', '♃', '♄', '♅', '♆', '△', '▽', '◯', '✡', '☥', '☾', '☀'];

let gameInterval = null;
let spawnInterval = null;
let timeLeft = 15;
let targetSymbol = null;
let correctClicks = 0;
let wrongClicks = 0;
let activeSymbolsPositions = []; // Массив для умного спавна

export function initMinigame() {
    const screen = document.getElementById('minigame-screen');
    const memorizePhase = document.getElementById('mg-memorize-phase');
    const playArea = document.getElementById('mg-play-area');
    const timerEl = document.getElementById('mg-timer');
    const resultBox = document.getElementById('mg-result-box');
    const resultText = document.getElementById('mg-result-text');

    window.startMinigame = () => {
        screen.style.display = 'flex';
        resultBox.style.display = 'none';
        playArea.innerHTML = '';
        playArea.style.display = 'none';
        memorizePhase.style.display = 'block';
        
        correctClicks = 0;
        wrongClicks = 0;
        timeLeft = 15;
        timerEl.textContent = timeLeft;
        activeSymbolsPositions = [];

        // Выбираем случайный символ
        targetSymbol = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
        document.getElementById('mg-target-symbol').textContent = targetSymbol;

        // Даем 3 секунды на запоминание
        setTimeout(() => {
            memorizePhase.style.display = 'none';
            playArea.style.display = 'block';
            startSpawning();
        }, 3000);
    };

    function startSpawning() {
        if (gameInterval) clearInterval(gameInterval);
        if (spawnInterval) clearInterval(spawnInterval);
        
        // Таймер игры
        gameInterval = setInterval(() => {
            timeLeft--;
            timerEl.textContent = timeLeft;
            if (timeLeft <= 0) endGame();
        }, 1000);

        // Спавним символы каждые 600мс
        spawnInterval = setInterval(() => {
            if (timeLeft <= 0) {
                clearInterval(spawnInterval);
                return;
            }
            spawnSymbol();
        }, 600);
    }

    function spawnSymbol() {
        const el = document.createElement('div');
        el.className = 'mg-floating-symbol';
        
        // 30% шанс выпадения нужного символа
        const isTarget = Math.random() < 0.3;
        const sym = isTarget ? targetSymbol : SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
        el.textContent = sym;

        // --- УМНЫЙ ПОИСК МЕСТА (ЧТОБЫ НЕ СЛИПАЛИСЬ) ---
        let x, y;
        let attempts = 0;
        let isTooClose = true;
        
        while (isTooClose && attempts < 20) {
            x = Math.random() * 80 + 10; // от 10% до 90%
            y = Math.random() * 80 + 10;
            
            isTooClose = false;
            for (const pos of activeSymbolsPositions) {
                const distance = Math.hypot(pos.x - x, pos.y - y);
                // Если символы ближе 25% друг к другу — ищем другое место
                if (distance < 25) {
                    isTooClose = true;
                    break;
                }
            }
            attempts++;
        }
        
        // Запоминаем позицию
        const posObj = { x, y };
        activeSymbolsPositions.push(posObj);

        el.style.left = `${x}%`;
        el.style.top = `${y}%`;
        el.style.opacity = '0';
        el.style.transform = 'scale(0.5)';
        playArea.appendChild(el);
        
        // Анимация появления
        requestAnimationFrame(() => {
            el.style.transition = 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
            el.style.opacity = '1';
            el.style.transform = 'scale(1)';
        });

        // Обработка клика
        el.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (el.classList.contains('clicked')) return;
            el.classList.add('clicked');

            if (sym === targetSymbol) {
                correctClicks++;
                el.classList.add('correct');
                haptic('notificationOccurred', 'success');
            } else {
                wrongClicks++;
                el.classList.add('wrong');
                haptic('notificationOccurred', 'error');
            }

            removeSymbol(el, posObj);
        };

        // Если не кликнули за 1.2 секунды — исчезает
        setTimeout(() => {
            if (!el.classList.contains('clicked')) {
                removeSymbol(el, posObj);
            }
        }, 1200);
    }

    function removeSymbol(el, posObj) {
        el.style.opacity = '0';
        el.style.transform = 'scale(1.5)';
        
        // Удаляем из массива занятых позиций
        const index = activeSymbolsPositions.indexOf(posObj);
        if (index > -1) {
            activeSymbolsPositions.splice(index, 1);
        }
        
        setTimeout(() => el.remove(), 300);
    }

        function endGame() {
        clearInterval(gameInterval);
        clearInterval(spawnInterval);
        
        playArea.querySelectorAll('.mg-floating-symbol').forEach(el => el.remove());
        activeSymbolsPositions = [];
        
        resultBox.style.display = 'block';

        const isWin = correctClicks > wrongClicks;
        
        if (isWin) {
            const reward = correctClicks * 3; 
            resultText.textContent = `Ты победил! Попаданий: ${correctClicks}. Награда: +${reward} 🪙`;
            resultText.style.color = "#ffb800";
        } else {
            const penalty = wrongClicks * 10;
            resultText.textContent = `Проклятие! Промахов: ${wrongClicks}. Таймер основного кулдауна продлен на ${penalty} минут.`;
            resultText.style.color = "#e11d48";
        }
        
        document.getElementById('mg-claim-btn').style.display = 'block';
           // После окончания мини-игры проверяем, не надо ли перерисовать стол
        setTimeout(async () => {
            // Импортируем функцию проверки кулдауна
            const { checkCooldownStatus } = await import('./cards.js');
            // Если карты были на столе, но мы наложили штраф — эта функция их уберет
            // (в cards.js есть проверка на diff > 0, которая чистит зону)
            checkCooldownStatus();
        }, 500);
        
        }

    // Кнопки
    document.getElementById('mg-claim-btn').onclick = async () => {
        const res = await apiFetch('/api/minigame/symbol-reward', { 
            method: 'POST', 
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ correct: correctClicks, wrong: wrongClicks }) 
        });
        
        if (res.ok) {
            const data = await res.json();
            
            playerProfile.points = data.new_points;
            if (DOM.coinBalanceEl) DOM.coinBalanceEl.textContent = data.new_points;
            if (data.last_pack_opened) playerProfile.last_pack_opened = data.last_pack_opened;
            
            // ОБНОВЛЯЕМ БЕЙДЖ
            const badge = document.getElementById('mg-attempts-badge');
            if (badge) badge.textContent = `${data.plays_left}/4`;

            toast(data.message);
            haptic(data.is_win ? 'notificationOccurred' : 'error', 'success');
        } else {
            const err = await res.json().catch(()=>({}));
            toast(err.detail || "Ошибка");
        }
        screen.style.display = 'none';
    };

    document.getElementById('mg-close-btn').onclick = () => {
        clearInterval(gameInterval);
        clearInterval(spawnInterval);
        screen.style.display = 'none';
    };
}
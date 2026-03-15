/* ==========================================
    sleepyDog - 大腦邏輯 (官方完美版)
   ========================================== */

let highestZIndex = 1000;

// --- 1. 果凍特效升級版 (防長條變形) ---
class JellyWidget {
    constructor(elementId) {
        this.widget = document.getElementById(elementId);
        if (!this.widget) return;
        
        this.handle = this.widget.querySelector('.drag-handle');
        this.iframe = this.widget.querySelector('iframe'); 
        this.isDragging = false;
        this.bindEvents();
    }

    bindEvents() {
        this.handle.addEventListener('mousedown', (e) => this.onMouseDown(e));
        this._onMouseMove = (e) => this.onMouseMove(e);
        this._onMouseUp = () => this.onMouseUp();
        
        document.addEventListener('mousemove', this._onMouseMove);
        document.addEventListener('mouseup', this._onMouseUp);
    }

    onMouseDown(e) {
        this.isDragging = true;
        highestZIndex++;
        this.widget.style.zIndex = highestZIndex;

        // 🌟 關鍵修復：取得目前實際座標，並清空 bottom/right 防止 CSS 拉扯
        const rect = this.widget.getBoundingClientRect();
        this.offsetX = e.clientX - rect.left;
        this.offsetY = e.clientY - rect.top;
        this.widget.style.bottom = 'auto';
        this.widget.style.right = 'auto';
        this.widget.style.left = rect.left + 'px';
        this.widget.style.top = rect.top + 'px';
        
        this.lastX = e.clientX; 
        this.lastY = e.clientY;
        
        this.widget.style.transition = 'none'; 
        this.widget.style.transform = 'scale(1.05)';
        if (this.iframe) this.iframe.style.pointerEvents = 'none'; 
    }

    onMouseMove(e) {
        if (!this.isDragging) return;
        
        let currentX = e.clientX, currentY = e.clientY;
        let speedX = currentX - this.lastX, speedY = currentY - this.lastY;
        this.lastX = currentX; this.lastY = currentY;
        
        let skewXValue = Math.max(-15, Math.min(15, speedX * 0.4));
        let skewYValue = Math.max(-15, Math.min(15, speedY * 0.4));
        
        this.widget.style.left = (currentX - this.offsetX) + 'px';
        this.widget.style.top = (currentY - this.offsetY) + 'px';
        this.widget.style.transform = `scale(1.05) skewX(${-skewXValue}deg) skewY(${-skewYValue}deg) rotate(${speedX/2}deg)`;
    }

    onMouseUp() {
        if (!this.isDragging) return;
        this.isDragging = false;
        this.widget.style.transition = 'transform 0.5s cubic-bezier(0.25, 1.5, 0.5, 1)';
        this.widget.style.transform = 'scale(1) skewX(0deg) skewY(0deg) rotate(0deg)';
        if (this.iframe) this.iframe.style.pointerEvents = 'auto';
    }
}

// --- 2. 下拉選單 UI (原版不動) ---
const UIManager = {
    init() {
        this.dropdownBtn = document.getElementById('dropdownBtn');
        this.dropdownContent = document.getElementById('dropdownContent');
        this.arrow = this.dropdownBtn ? this.dropdownBtn.querySelector('.arrow') : null;

        if(this.dropdownBtn) {
            this.dropdownBtn.addEventListener('click', () => {
                this.dropdownContent.classList.toggle('show');
                if(this.arrow) this.arrow.classList.toggle('rotate');
            });
        }
    }
};

// --- 3. Lanyard 雷達 (原版不動) ---
const DiscordRadar = {
    USER_ID: "987379082687823972",
    init() {
        this.statusDot = document.getElementById('discord-status-dot');
        this.statusText = document.getElementById('discord-status-text');
        this.avatarImg = document.getElementById('real-discord-avatar');
        this.spotifyCard = document.getElementById('spotify-card');
        this.spotifyAlbumArt = document.getElementById('spotify-album-art');
        this.spotifySongText = document.getElementById('spotify-song-text');
        this.topSpotifyContainer = document.getElementById('top-spotify-container');

        this.connectWebSocket();
    },
    connectWebSocket() {
        const ws = new WebSocket("wss://api.lanyard.rest/socket");
        ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.op === 1) {
                ws.send(JSON.stringify({ op: 2, d: { subscribe_to_id: this.USER_ID } }));
            } else if (data.op === 0) {
                const profileData = data.d;
                this.updateProfile(profileData);
                this.updateStatus(profileData);
                this.updateSpotify(profileData);
            }
        };
    },
    updateProfile(p) {
        if(!this.avatarImg) return;
        const ext = p.discord_user.avatar.startsWith('a_') ? 'gif' : 'png';
        this.avatarImg.src = `https://cdn.discordapp.com/avatars/${this.USER_ID}/${p.discord_user.avatar}.${ext}?size=128`;
        if(this.statusDot) this.statusDot.className = `status-dot ${p.discord_status}`;
    },
    updateStatus(p) {
        if(!this.statusText) return;
        let customStatus = p.activities.find(a => a.id === "custom");
        let gameStatus = p.activities.find(a => a.id !== "custom" && a.name !== "Spotify");

        if (gameStatus) {
            this.statusText.innerText = `🎮 ${gameStatus.name}`;
        } else if (customStatus && customStatus.state) {
            let emoji = customStatus.emoji ? (customStatus.emoji.id ? "👾" : customStatus.emoji.name) : "💬";
            this.statusText.innerText = `${emoji} ${customStatus.state}`;
        } else {
            this.statusText.innerText = p.discord_status === "offline" ? "離線" : "線上";
        }
    },
    updateSpotify(p) {
        if (p.listening_to_spotify && p.spotify && this.spotifyCard) {
            this.spotifyCard.style.display = "flex"; 
            if(this.spotifyAlbumArt) this.spotifyAlbumArt.src = p.spotify.album_art_url;
            if(this.spotifySongText) this.spotifySongText.innerText = `${p.spotify.song} by ${p.spotify.artist}`;
            if(this.topSpotifyContainer) {
                this.topSpotifyContainer.style.display = "flex";
                document.getElementById('top-spotify-title').innerText = p.spotify.song;
                document.getElementById('top-spotify-img').src = p.spotify.album_art_url;
                document.getElementById('top-spotify-song').innerText = p.spotify.song;
                document.getElementById('top-spotify-artist').innerText = p.spotify.artist;
            }
        } else if(this.spotifyCard) {
            this.spotifyCard.style.display = "none"; 
            if(this.topSpotifyContainer) this.topSpotifyContainer.style.display = "none";
        }
    }
};

// --- 4. 系統資訊 (原版不動) ---
const SystemInfo = {
    init() {
        this.initTimeAndCalendar();
        setInterval(() => this.initTimeAndCalendar(), 60000); 
        this.initBattery();
        this.fetchWeather();
    },
    initTimeAndCalendar() {
        const now = new Date();
        let h = now.getHours(), m = now.getMinutes(), ampm = h >= 12 ? 'PM' : 'AM';
        h = h % 12 || 12; 
        m = m < 10 ? '0' + m : m;
        const clockEl = document.getElementById('linux-clock');
        if(clockEl) clockEl.innerText = `${h}:${m} ${ampm}`;
        
        const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).getDay();
        
        let calHTML = `<div>${now.getFullYear()}年 ${now.getMonth()+1}月</div><div class="cal-grid">`;
        const weekDays = ['日','一','二','三','四','五','六'];
        weekDays.forEach(d => calHTML += `<div style="color:var(--text-muted);">${d}</div>`);
        
        for(let i=0; i<firstDay; i++) calHTML += `<div></div>`; 
        for(let i=1; i<=daysInMonth; i++) {
            let isToday = (i === now.getDate()) ? 'cal-today' : '';
            calHTML += `<div class="cal-day ${isToday}">${i}</div>`;
        }
        calHTML += `</div>`;
        const calContainer = document.getElementById('calendar-container');
        if(calContainer) calContainer.innerHTML = calHTML;
    },
    initBattery() {
        if (navigator.getBattery) {
            navigator.getBattery().then((battery) => {
                const updateBatteryInfo = () => {
                    let level = Math.round(battery.level * 100);
                    let icon = battery.charging ? '⚡' : '🔋';
                    const batEl = document.getElementById('battery-status');
                    if(batEl) batEl.innerHTML = `<span class="linux-icon">${icon}</span> ${level}%`;
                };
                updateBatteryInfo();
                battery.addEventListener('levelchange', updateBatteryInfo);
                battery.addEventListener('chargingchange', updateBatteryInfo);
            });
        }
    },
    async fetchWeather() {
        try {
            const res = await fetch('https://api.open-meteo.com/v1/forecast?latitude=25.04&longitude=121.53&current_weather=true');
            const data = await res.json();
            const w = data.current_weather;
            const wBtn = document.getElementById('weather-btn');
            const wDet = document.getElementById('weather-details');
            if(wBtn) wBtn.innerHTML = `<span class="linux-icon">☁</span> ${w.temperature}°C`;
            if(wDet) wDet.innerHTML = `
                <div style="color:white; font-weight:bold;">Taipei City</div>
                <div>溫度：${w.temperature}°C</div>
                <div>風速：${w.windspeed} km/h</div>
            `;
        } catch (e) {
            const wBtn = document.getElementById('weather-btn');
            if(wBtn) wBtn.innerHTML = `<span class="linux-icon">☁</span> 離線`;
        }
    }
};

// --- 5. 自訂音樂播放器 (原版 + 通知 3D 引擎掉落) ---
const MusicPlayer = {
    playlist: [
        { title: "all that i can think about", artist: "idk", src: "assets/allthaticanthinkabout.mp3" },
        { title: "Lofi Study", artist: "SleepyDog", src: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3" }
    ],
    currentIndex: 0,
    init() {
        this.audio = document.getElementById('bg-audio');
        this.enterScreen = document.getElementById('enter-screen');
        
        this.titleEl = document.getElementById('player-title');
        this.artistEl = document.getElementById('player-artist');
        this.playBtn = document.getElementById('btn-play');
        this.prevBtn = document.getElementById('btn-prev');
        this.nextBtn = document.getElementById('btn-next');
        this.progressBar = document.getElementById('progress-bar');
        this.volumeBar = document.getElementById('volume-bar');
        this.timeCurrent = document.getElementById('time-current');
        this.timeTotal = document.getElementById('time-total');

        if(this.audio && this.titleEl) {
            this.loadSong(this.currentIndex);
            this.bindEvents();
        }
    },
    loadSong(index) {
        const song = this.playlist[index];
        if(this.audio) this.audio.src = song.src;
        if(this.titleEl) this.titleEl.innerText = song.title;
        if(this.artistEl) this.artistEl.innerText = song.artist;
    },
    bindEvents() {
        if(this.enterScreen) {
            this.enterScreen.addEventListener('click', () => {
                this.enterScreen.classList.add('hidden');
                
                // 🌟 淡出黑幕，露出後面的正常網站
                const blackBg = document.getElementById('black-bg');
                if(blackBg) {
                    blackBg.style.opacity = '0';
                    setTimeout(() => blackBg.remove(), 1000);
                }
                
                setTimeout(() => this.enterScreen.style.display = 'none', 1000);
                this.togglePlay(true);

                // 🌟 通知 3D 引擎開啟重力，狗狗掉落！
                window.isSiteEntered = true;
            });
        }

        if(this.playBtn) this.playBtn.addEventListener('click', () => this.togglePlay());
        if(this.prevBtn) this.prevBtn.addEventListener('click', () => this.changeSong(-1));
        if(this.nextBtn) this.nextBtn.addEventListener('click', () => this.changeSong(1));

        if(this.audio) {
            this.audio.addEventListener('timeupdate', () => this.updateProgress());
            this.audio.addEventListener('ended', () => this.changeSong(1));
        }
        if(this.progressBar) {
            this.progressBar.addEventListener('input', (e) => {
                const seekTime = (this.audio.duration / 100) * e.target.value;
                this.audio.currentTime = seekTime;
            });
        }
        if(this.volumeBar) {
            this.volumeBar.addEventListener('input', (e) => {
                if(this.audio) this.audio.volume = e.target.value;
            });
        }
    },
    togglePlay(forcePlay = false) {
        if(!this.audio) return;
        if (this.audio.paused || forcePlay) {
            this.audio.play().catch(e=>console.log(e));
            if(this.playBtn) this.playBtn.innerText = "⏸";
        } else {
            this.audio.pause();
            if(this.playBtn) this.playBtn.innerText = "▶";
        }
    },
    changeSong(direction) {
        this.currentIndex += direction;
        if (this.currentIndex >= this.playlist.length) this.currentIndex = 0;
        if (this.currentIndex < 0) this.currentIndex = this.playlist.length - 1;
        this.loadSong(this.currentIndex);
        this.togglePlay(true);
    },
    updateProgress() {
        if (!this.audio || isNaN(this.audio.duration)) return;
        const progressPercent = (this.audio.currentTime / this.audio.duration) * 100;
        if(this.progressBar) this.progressBar.value = progressPercent;
        if(this.timeCurrent) this.timeCurrent.innerText = this.formatTime(this.audio.currentTime);
        if(this.timeTotal) this.timeTotal.innerText = this.formatTime(this.audio.duration);
    },
    formatTime(seconds) {
        if (isNaN(seconds)) return "0:00";
        const min = Math.floor(seconds / 60);
        const sec = Math.floor(seconds % 60);
        return `${min}:${sec < 10 ? '0' : ''}${sec}`;
    }
};

// --- 6. 終端機系統 ---
const TerminalManager = {
    init() {
        this.input = document.getElementById('terminal-input');
        this.output = document.getElementById('terminal-output');
        if(this.input) {
            this.input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    const cmd = this.input.value.toLowerCase().trim();
                    this.execute(cmd);
                    this.input.value = '';
                }
            });
        }
    },
    execute(cmd) {
        if (cmd === '') return;
        if (cmd === 'start-rpg') {
            document.getElementById('rpg-game-window').style.display = 'block';
            if (!window.rpgGame) window.rpgGame = new SimpleRPG('rpg-canvas');
            this.print("> Accessing inner mind palace... [OK]");
        } else if (cmd === 'help') {
            this.print("> Available commands: start-rpg, clear, about");
        } else if (cmd === 'clear') {
            this.output.innerHTML = '';
        } else {
            this.print(`> Command not found: ${cmd}`);
        }
    },
    print(text) {
        const div = document.createElement('div');
        div.innerText = text;
        this.output.appendChild(div);
        this.output.scrollTop = this.output.scrollHeight;
    }
};

// --- 7. 2D RPG 遊戲引擎 ---
class SimpleRPG {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');
        
        this.assets = {
            player: new Image(), music: new Image(), profile: new Image(), heart: new Image(), trash: new Image()
        };
        // 避免圖片讀不到報錯
        Object.values(this.assets).forEach(img => img.onerror = () => console.log('Image not found:', img.src));
        
        this.assets.player.src = 'assets/player.png'; 
        this.assets.music.src = 'assets/music.png'; 
        this.assets.profile.src = 'assets/profile.png'; 
        this.assets.heart.src = 'assets/heart.png'; 
        this.assets.trash.src = 'assets/trash.png'; 

        this.player = { x: 234, y: 134, width: 32, height: 32, speed: 4 };
        this.keys = {};
        this.isDialogueActive = false;
        this.dialogueText = "";
        this.currentLine = 0;
        this.activeDialogueList = [];

        this.zones = [
            { name: "Music", x: 10, y: 10, w: 40, h: 40, img: this.assets.music, imgX: 20, imgY: 20, imgSize: 24, triggered: false, dialogue: ["頻率，是我賴以生存的救贖。", "當現實世界的雜音大到令人窒息時，我會戴上耳機", "把自己沉浸在音樂的節拍裡。", "每一個鼓點，就像是絕對理性的節拍器。", "安撫著焦慮，將大腦裡混亂的思緒重新編譯。", "在這裡，音樂不是背景音。", "而是隔絕崩塌世界的最後一道結界。"] },
            { name: "About", x: 10, y: 250, w: 40, h: 40, img: this.assets.profile, imgX: 20, imgY: 256, imgSize: 24, triggered: false, dialogue: ["這是我，savior666。", "一個擅長把咖啡轉換成錯誤訊息的人。", "但我更覺得，我們是在 0 與 1 的荒漠中，", "尋找絕對真理的信徒。", "螢幕發出的冷光，是我最熟悉的溫度。", "而那些解不完的 Bug，", "是我與這個不完美世界對話的唯一方式。"] },
            { name: "Thoughts", x: 450, y: 10, w: 40, h: 40, img: this.assets.heart, imgX: 456, imgY: 20, imgSize: 24, triggered: false, dialogue: ["夜深人靜時，我經常盯著閃爍的游標發呆。", "有時候會覺得，我寫下的每一行邏輯。" ,"其實都不是冰冷的程式碼，", "而是無聲的遺言。", "偵測到核心溢位...有時我非常焦慮", "我看著鏡子...", "總覺得自己像是一段過時且沉重的廢棄碼。", "我以為我在前進", "卻感覺只是在拖累身後的人。", "我曾無數次想過按下終止鍵（Abort），", "卻始終缺乏跨出那一步的權限。", "所以我只能不斷重複地創造變數定義常數。", "試圖在充滿未知與失控的宇宙裡，", "建立一個能由自己絕對掌控的小小沙盒。", "這是我對抗世界僅剩的手段。"] },
            { name: "Trash", x: 450, y: 250, w: 40, h: 40, img: this.assets.trash, imgX: 456, imgY: 256, imgSize: 24, triggered: false, dialogue: ["歡迎來到我的數位墳場。", "這裡躺著無數個 final_v2_new.js。", "它們構成了現在的我。", "每一次按下 Delete。", "都像是在否定過去的自己。", "但如果不把這些殘骸堆疊起來，", "也無法構成我。", "這些被世界定義為垃圾的碎片，", "才是構建出『我』最真實的基石。"] }
        ];

        window.addEventListener('keydown', (e) => {
            if (document.activeElement.id !== 'terminal-input') {
                this.keys[e.key.toLowerCase()] = true;
                if (this.isDialogueActive && e.code === 'Space') this.nextDialogue();
            }
        });
        window.addEventListener('keyup', (e) => this.keys[e.key.toLowerCase()] = false);

        this.startDialogue(["系統連線中... 雜訊過濾完畢。", "歡迎來到 savior666 的意識象限。", "這裡沒有外界的喧囂。", "只有純粹的邏輯與未經修飾的思緒。", "你可以透過 [W][A][S][D] 或方向鍵在這些記憶碎片中穿梭。", "去觸碰那些發光的角落吧，那是我靈魂的倒影。",
            "(按下 Space 鍵，開始同步資料)"]);
        this.loop();
    }

    startDialogue(list) {
        this.isDialogueActive = true; this.currentLine = 0; this.activeDialogueList = list;
        this.typeText(this.activeDialogueList[this.currentLine]);
    }
    typeText(text) {
        let charIndex = 0; this.dialogueText = "";
        const timer = setInterval(() => {
            if (charIndex < text.length) { this.dialogueText += text[charIndex++]; } 
            else { clearInterval(timer); }
        }, 50);
    }
    nextDialogue() {
        this.currentLine++;
        if (this.currentLine < this.activeDialogueList.length) this.typeText(this.activeDialogueList[this.currentLine]);
        else { this.isDialogueActive = false; this.dialogueText = ""; }
    }

    update() {
        if (this.isDialogueActive) return; 
        if (this.keys['arrowup'] || this.keys['w']) this.player.y -= this.player.speed;
        if (this.keys['arrowdown'] || this.keys['s']) this.player.y += this.player.speed;
        if (this.keys['arrowleft'] || this.keys['a']) this.player.x -= this.player.speed;
        if (this.keys['arrowright'] || this.keys['d']) this.player.x += this.player.speed;
        this.player.x = Math.max(0, Math.min(this.canvas.width - this.player.width, this.player.x));
        this.player.y = Math.max(0, Math.min(this.canvas.height - this.player.height, this.player.y));

        this.zones.forEach(zone => {
            if (!zone.triggered && this.player.x < zone.x + zone.w && this.player.x + this.player.width > zone.x && this.player.y < zone.y + zone.h && this.player.y + this.player.height > zone.y) {
                zone.triggered = true; this.keys = {}; this.startDialogue(zone.dialogue);
            }
            if (zone.triggered && (this.player.x > zone.x + zone.w + 10 || this.player.x + this.player.width < zone.x - 10 || this.player.y > zone.y + zone.h + 10 || this.player.y + this.player.height < zone.y - 10)) {
                zone.triggered = false;
            }
        });
    }

    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)'; this.ctx.lineWidth = 1;
        for(let i = 0; i <= this.canvas.width; i+=50) { this.ctx.beginPath(); this.ctx.moveTo(i, 0); this.ctx.lineTo(i, this.canvas.height); this.ctx.stroke(); }
        for(let i = 0; i <= this.canvas.height; i+=50) { this.ctx.beginPath(); this.ctx.moveTo(0, i); this.ctx.lineTo(this.canvas.width, i); this.ctx.stroke(); }

        this.zones.forEach(zone => {
            this.ctx.fillStyle = 'rgba(30, 215, 96, 0.15)'; this.ctx.fillRect(zone.x, zone.y, zone.w, zone.h);
            if (zone.img.complete && zone.img.naturalWidth > 0) {
                this.ctx.drawImage(zone.img, zone.imgX, zone.imgY, zone.imgSize, zone.imgSize);
            }
        });

        if (this.assets.player.complete && this.assets.player.naturalWidth > 0) {
            this.ctx.drawImage(this.assets.player, this.player.x, this.player.y, this.player.width, this.player.height);
        } else {
            this.ctx.fillStyle = '#1ed760';
            this.ctx.fillRect(this.player.x, this.player.y, this.player.width, this.player.height);
        }

        if (this.isDialogueActive) {
            this.ctx.fillStyle = "rgba(0, 0, 0, 0.85)"; this.ctx.fillRect(20, this.canvas.height - 90, this.canvas.width - 40, 70);
            this.ctx.strokeStyle = "#1ed760"; this.ctx.lineWidth = 2; this.ctx.strokeRect(20, this.canvas.height - 90, this.canvas.width - 40, 70);
            this.ctx.fillStyle = "white"; this.ctx.font = "14px 'Fira Code', monospace"; this.ctx.fillText(this.dialogueText, 40, this.canvas.height - 50);
            if (this.dialogueText.length === this.activeDialogueList[this.currentLine].length) {
                this.ctx.font = "10px monospace"; this.ctx.fillText("[ Space ]", 380, this.canvas.height - 30);
            }
        }
    }
    loop() { this.update(); this.draw(); requestAnimationFrame(() => this.loop()); }
}

// ==========================================
// 🚀 啟動引擎
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    // 1. 初始化果凍視窗
    new JellyWidget('custom-music-player');
    new JellyWidget('draggable-spotify');
    new JellyWidget('terminal-window');
    new JellyWidget('rpg-game-window');
    
    // 2. 原版功能啟動
    UIManager.init(); 
    DiscordRadar.init(); 
    SystemInfo.init(); 
    MusicPlayer.init(); 
    TerminalManager.init();

    // 3. 遊戲按鈕控制
    window.addEventListener('keydown', (e) => {
        if (e.key === '`') {
            const t = document.getElementById('terminal-window');
            if(t) t.style.display = (t.style.display === 'none' || t.style.display === '') ? 'block' : 'none';
        }
    });
    
    const tBtn = document.getElementById('toggle-terminal-btn');
    if (tBtn) tBtn.addEventListener('click', () => {
        const t = document.getElementById('terminal-window');
        if(t) t.style.display = (t.style.display === 'none' || t.style.display === '') ? 'block' : 'none';
    });

    const cBtn = document.getElementById('rpg-close-btn');
    if (cBtn) cBtn.addEventListener('click', (e) => {
        document.getElementById('rpg-game-window').style.display = 'none'; e.stopPropagation();
    });

    const dBtn = document.getElementById('spawn-dog-btn');
    if (dBtn) dBtn.addEventListener('click', () => {
        if (typeof window.spawnSolidDog === 'function') window.spawnSolidDog();
    });
});
/* ==========================================
    sleepyDog - 大腦邏輯 (終極雙播放器版)
   ========================================== */

let highestZIndex = 1000;

// --- 1. 果凍特效升級版 (可產生多個視窗) ---
class JellyWidget {
    constructor(elementId) {
        this.widget = document.getElementById(elementId);
        if (!this.widget) return;
        
        this.handle = this.widget.querySelector('.drag-handle');
        this.iframe = this.widget.querySelector('iframe'); 
        this.isDragging = false;
        this.offsetX = 0; this.offsetY = 0;
        this.lastX = 0; this.lastY = 0;

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

        this.offsetX = e.clientX - this.widget.getBoundingClientRect().left;
        this.offsetY = e.clientY - this.widget.getBoundingClientRect().top;
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
        this.widget.style.right = 'auto'; 
        this.widget.style.bottom = 'auto';
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


// --- 2. 下拉選單 UI ---
const UIManager = {
    init() {
        this.dropdownBtn = document.getElementById('dropdownBtn');
        this.dropdownContent = document.getElementById('dropdownContent');
        this.arrow = this.dropdownBtn.querySelector('.arrow');

        this.dropdownBtn.addEventListener('click', () => {
            this.dropdownContent.classList.toggle('show');
            this.arrow.classList.toggle('rotate');
        });
    }
};


// --- 3. Lanyard 雷達 ---
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
        ws.onerror = (e) => console.error("Lanyard 連線錯誤:", e);
    },

    updateProfile(p) {
        const ext = p.discord_user.avatar.startsWith('a_') ? 'gif' : 'png';
        this.avatarImg.src = `https://cdn.discordapp.com/avatars/${this.USER_ID}/${p.discord_user.avatar}.${ext}?size=128`;
        this.statusDot.className = `status-dot ${p.discord_status}`;
    },

    updateStatus(p) {
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
        if (p.listening_to_spotify && p.spotify) {
            this.spotifyCard.style.display = "flex"; 
            this.spotifyAlbumArt.src = p.spotify.album_art_url;
            this.spotifySongText.innerText = `${p.spotify.song} by ${p.spotify.artist}`;
            this.topSpotifyContainer.style.display = "flex";
            document.getElementById('top-spotify-title').innerText = p.spotify.song;
            document.getElementById('top-spotify-img').src = p.spotify.album_art_url;
            document.getElementById('top-spotify-song').innerText = p.spotify.song;
            document.getElementById('top-spotify-artist').innerText = p.spotify.artist;
        } else {
            this.spotifyCard.style.display = "none"; 
            this.topSpotifyContainer.style.display = "none";
        }
    }
};


// --- 4. 系統資訊 ---
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
        document.getElementById('linux-clock').innerText = `${h}:${m} ${ampm}`;
        
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
        document.getElementById('calendar-container').innerHTML = calHTML;
    },

    initBattery() {
        if (navigator.getBattery) {
            navigator.getBattery().then((battery) => {
                const updateBatteryInfo = () => {
                    let level = Math.round(battery.level * 100);
                    let icon = battery.charging ? '⚡' : '🔋';
                    document.getElementById('battery-status').innerHTML = `<span class="linux-icon">${icon}</span> ${level}%`;
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
            document.getElementById('weather-btn').innerHTML = `<span class="linux-icon">☁</span> ${w.temperature}°C`;
            document.getElementById('weather-details').innerHTML = `
                <div style="color:white; font-weight:bold;">Taipei City</div>
                <div>溫度：${w.temperature}°C</div>
                <div>風速：${w.windspeed} km/h</div>
            `;
        } catch (e) {
            console.error("天氣抓取失敗:", e);
            document.getElementById('weather-btn').innerHTML = `<span class="linux-icon">☁</span> 離線`;
        }
    }
};

// --- 5. 自訂音樂播放器邏輯 ---
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
        this.audio.src = song.src;
        this.titleEl.innerText = song.title;
        this.artistEl.innerText = song.artist;
    },

    bindEvents() {
        if(this.enterScreen) {
            this.enterScreen.addEventListener('click', () => {
                this.enterScreen.classList.add('hidden');
                setTimeout(() => this.enterScreen.remove(), 1000);
                this.togglePlay(true);
            });
        }

        this.playBtn.addEventListener('click', () => this.togglePlay());
        this.prevBtn.addEventListener('click', () => this.changeSong(-1));
        this.nextBtn.addEventListener('click', () => this.changeSong(1));

        this.audio.addEventListener('timeupdate', () => this.updateProgress());
        this.progressBar.addEventListener('input', (e) => {
            const seekTime = (this.audio.duration / 100) * e.target.value;
            this.audio.currentTime = seekTime;
        });

        this.volumeBar.addEventListener('input', (e) => {
            this.audio.volume = e.target.value;
        });

        this.audio.addEventListener('ended', () => this.changeSong(1));
    },

    togglePlay(forcePlay = false) {
        if (this.audio.paused || forcePlay) {
            this.audio.play();
            this.playBtn.innerText = "⏸";
        } else {
            this.audio.pause();
            this.playBtn.innerText = "▶";
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
        if (isNaN(this.audio.duration)) return;
        const progressPercent = (this.audio.currentTime / this.audio.duration) * 100;
        this.progressBar.value = progressPercent;
        this.timeCurrent.innerText = this.formatTime(this.audio.currentTime);
        this.timeTotal.innerText = this.formatTime(this.audio.duration);
    },

    formatTime(seconds) {
        const min = Math.floor(seconds / 60);
        const sec = Math.floor(seconds % 60);
        return `${min}:${sec < 10 ? '0' : ''}${sec}`;
    }
};

// ==========================================
// 啟動引擎
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    // 產生兩個果凍視窗
    new JellyWidget('custom-music-player');
    new JellyWidget('draggable-spotify');
    
    UIManager.init();
    DiscordRadar.init();
    SystemInfo.init();
    MusicPlayer.init();
});
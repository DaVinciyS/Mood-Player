/* =================================================================
   MOOD PLAYER PRO - ULTIMATE FIX (v4.1)
   Created by: Kaptan & Gemini
   Fixes: Audio Context Bug, Button Visibility, CSS Layouts
   ================================================================= */

// --- GLOBAL DEĞİŞKENLER ---
const dbName = "MoodPlayerDB";
const storeName = "songs";
const coverStoreName = "playlist_covers";
let db;

// 1. ÖNEMLİ DÜZELTME: HTML'deki Audio elementini seçiyoruz!
let audio = document.getElementById('audio-player');
if (!audio) {
    // Eğer HTML'de yoksa (ki var), yine de hata vermesin diye oluştur.
    audio = new Audio();
    document.body.appendChild(audio);
}
audio.crossOrigin = "anonymous";

// Audio & Efekt Düğümleri
let audioContext, analyser, source;
let bassBoostNode, eqLowNode, eqMidNode, eqHighNode;
let isAudioSetup = false;

// Durum Değişkenleri
let allSongs = [];
let currentPlaylist = [];
let currentIndex = 0;
let repeatState = 0; // 0:Off, 1:All, 2:One
let contextMenuTargetId = null;

// Veriler (LocalStorage)
let favorites = JSON.parse(localStorage.getItem('favorites')) || [];
let myPlaylists = JSON.parse(localStorage.getItem('myPlaylists')) || [];

// DOM Elementleri
const mainView = document.getElementById('main-view');
const playerBar = document.querySelector('.music-player-bar');
const fileInput = document.getElementById('file-input');

// =======================================================
// 1. BAŞLATMA (INIT)
// =======================================================
document.addEventListener('DOMContentLoaded', () => {
    console.log("🚀 Mood Player (Fixed) Başlatılıyor...");
    
    if(playerBar) {
        playerBar.style.zIndex = "2147483647";
        playerBar.style.position = "fixed";
    }

    setupKeyboardControls();
    loadSettings();
    loadProfile();
    setupDB(); 
    bindPlayerControls();
    
    // Ses çubuğunu başlangıçta dolu göster
    setTimeout(() => {
        const slider = document.getElementById('volume-slider');
        if(slider) slider.dispatchEvent(new Event('input'));
    }, 500);
});

// =======================================================
// 2. SES MOTORU & EQ (AUDIO ENGINE)
// =======================================================
function setupAudioSystem() {
    if(isAudioSetup) return;

    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if(!AudioContext) return;

    audioContext = new AudioContext();

    // 1. Kaynak Yarat (Hata korumalı)
    try {
        source = audioContext.createMediaElementSource(audio);
    } catch (e) { 
        console.log("⚠️ Kaynak zaten bağlı, devam ediliyor..."); 
        // Eğer zaten bağlıysa tekrar bağlamaya çalışma, visualizer çalışmayabilir ama ses çalar.
        isAudioSetup = true; 
        return; 
    }

    // 2. Filtreleri Oluştur
    bassBoostNode = audioContext.createBiquadFilter();
    bassBoostNode.type = 'lowshelf';
    bassBoostNode.frequency.value = 60;
    bassBoostNode.gain.value = parseFloat(localStorage.getItem('eq_bass_boost')) || 0;

    eqLowNode = audioContext.createBiquadFilter();
    eqLowNode.type = 'lowshelf';
    eqLowNode.frequency.value = 320;
    eqLowNode.gain.value = parseFloat(localStorage.getItem('eq_low')) || 0;

    eqMidNode = audioContext.createBiquadFilter();
    eqMidNode.type = 'peaking';
    eqMidNode.Q.value = 0.5;
    eqMidNode.frequency.value = 1000;
    eqMidNode.gain.value = parseFloat(localStorage.getItem('eq_mid')) || 0;

    eqHighNode = audioContext.createBiquadFilter();
    eqHighNode.type = 'highshelf';
    eqHighNode.frequency.value = 3200;
    eqHighNode.gain.value = parseFloat(localStorage.getItem('eq_high')) || 0;

    analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;

    // 3. Bağlantı Zinciri
    source.connect(bassBoostNode);
    bassBoostNode.connect(eqLowNode);
    eqLowNode.connect(eqMidNode);
    eqMidNode.connect(eqHighNode);
    eqHighNode.connect(analyser);
    analyser.connect(audioContext.destination);

    setupVisualizerCanvas();
    isAudioSetup = true;
    updateEqSlidersUI();
}

function updateEqSlidersUI() {
    const bb = document.getElementById('bass-boost');
    const low = document.getElementById('eq-low');
    const mid = document.getElementById('eq-mid');
    const high = document.getElementById('eq-high');

    if(bb && bassBoostNode) bb.value = bassBoostNode.gain.value;
    if(low && eqLowNode) low.value = eqLowNode.gain.value;
    if(mid && eqMidNode) mid.value = eqMidNode.gain.value;
    if(high && eqHighNode) high.value = eqHighNode.gain.value;
}

// =======================================================
// 3. OYNATMA MANTIĞI
// =======================================================
async function safePlay() {
    // 1. Context'i uyandır
    if (audioContext && audioContext.state === 'suspended') {
        try { await audioContext.resume(); } catch (e) { console.error(e); }
    }
    
    // 2. Ses motorunu kur
    if(!isAudioSetup) setupAudioSystem();

    // --- FADE IN MANTIĞI BAŞLANGICI ---
    const isFadeOn = localStorage.getItem('useCrossfade') === 'on';
    const slider = document.getElementById('volume-slider');
    const targetVolume = slider ? parseFloat(slider.value) : 1; // Kullanıcının asıl ses ayarı

    if (isFadeOn) {
        audio.volume = 0; // Sesi önce sıfırla
    } else {
        audio.volume = targetVolume; // Özellik kapalıysa direkt ayarlı ses
    }
    // ----------------------------------

    try {
        await audio.play();
        playerBar.classList.add('playing');
        document.getElementById('play-btn').innerHTML = '<i class="fa-solid fa-pause"></i>';

        // --- FADE IN ANİMASYONU ---
        if (isFadeOn) {
            let currentVol = 0;
            const fadeStep = targetVolume / 20; // 20 adımda hedefe ulaş
            
            // Eski bir interval varsa temizleyelim (çakışma olmasın)
            if (window.fadeInterval) clearInterval(window.fadeInterval);

            window.fadeInterval = setInterval(() => {
                // Eğer şarkı durdurulursa veya ses manuel değiştirilirse iptal et
                if (audio.paused) { clearInterval(window.fadeInterval); return; }

                currentVol += fadeStep;
                
                if (currentVol >= targetVolume) {
                    audio.volume = targetVolume;
                    clearInterval(window.fadeInterval);
                } else {
                    audio.volume = currentVol;
                }
            }, 100); // Her 100ms'de bir artır (Toplam ~2 saniye sürer)
        }
        // -------------------------

    } catch (error) {
        console.error("Oynatma Hatası:", error);
    }
}

function loadSong(song) {
    if (!song) return;
    
    document.getElementById('bar-title').innerText = song.name;
    document.getElementById('bar-artist').innerText = song.artist;
    //document.getElementById('bar-cover').src = song.cover;
    
    const barCover = document.getElementById('bar-cover');
    barCover.src = song.cover;
    barCover.style.display = 'block'; // Şarkı yüklendiği an resmi görünür yap!

    const likeBtn = document.getElementById('bar-like-btn');
    if(likeBtn) {
        likeBtn.innerHTML = favorites.includes(song.id) ? 
            '<i class="fa-solid fa-heart" style="color:#e74c3c"></i>' : 
            '<i class="fa-regular fa-heart"></i>';
        likeBtn.onclick = () => {
            const idx = favorites.indexOf(song.id);
            if(idx === -1) favorites.push(song.id); else favorites.splice(idx, 1);
            localStorage.setItem('favorites', JSON.stringify(favorites));
            loadSong(song);
        };
    }

    // Şarkı yolunu ata
    audio.src = song.path;
    
    // Sliderları sıfırla
    const seekBar = document.getElementById('seek-bar');
    if(seekBar) seekBar.value = 0;
    document.getElementById('current-time').innerText = "0:00";

    updateAmbientBackground(song.cover);

    // Listede bu şarkıyı bul ve parlat
    updateActiveSongHighlight(song.id);

    if(song.mood) {
        saveDailyMood(song.mood);
    }

    // --- CHILL MOD KONTROLÜ (loadSong fonksiyonunun en sonuna) ---
    if(isChillMode) {
        audio.playbackRate = 0.85;
        if(audio.preservesPitch !== undefined) audio.preservesPitch = false;
    } else {
        audio.playbackRate = 1.0;
        if(audio.preservesPitch !== undefined) audio.preservesPitch = true;
    }
    // -----------------------------------------------------------
}

// Global Kontroller
window.togglePlayPause = function() {
    if (!audio.src) return showNotification("Hata", "warning", "Lütfen önce bir şarkı seçin!");
    audio.paused ? safePlay() : audio.pause();
};

window.playNext = function() {
    if(currentPlaylist.length === 0) return;
    currentIndex = (currentIndex + 1) % currentPlaylist.length;
    loadSong(currentPlaylist[currentIndex]);
    safePlay();
};

window.playPrev = function() {
    if(currentPlaylist.length === 0) return;
    currentIndex = (currentIndex - 1 + currentPlaylist.length) % currentPlaylist.length;
    loadSong(currentPlaylist[currentIndex]);
    safePlay();
};

// Audio Olayları
audio.onpause = () => {
    playerBar.classList.remove('playing');
    document.getElementById('play-btn').innerHTML = '<i class="fa-solid fa-play"></i>';
};

audio.ontimeupdate = () => {
    const seekBar = document.getElementById('seek-bar');
    updateSeekGradient();
    if(document.activeElement !== seekBar) {
        seekBar.value = audio.currentTime;
        document.getElementById('current-time').innerText = formatTime(audio.currentTime);
    }
};

audio.onloadedmetadata = () => {
    const seekBar = document.getElementById('seek-bar');
    if(audio.duration) {
        seekBar.max = audio.duration;
        document.getElementById('duration').innerText = formatTime(audio.duration);
    }
};

audio.onended = () => {
    if (repeatState === 2) { audio.currentTime = 0; safePlay(); }
    else if (repeatState === 1 || currentIndex < currentPlaylist.length - 1) playNext();
    else audio.pause();
};

// =======================================================
// 4. PLAYER KONTROLLERİ
// =======================================================
function bindPlayerControls() {
    // Seek Bar (Sarma Çubuğu)
    const seekBar = document.getElementById('seek-bar');
    if(seekBar) {
        seekBar.oninput = function() { 
            audio.currentTime = this.value;
            updateSeekGradient();
        };
    }

    // Repeat
    const repeatBtn = document.getElementById('repeat-btn');
    if(repeatBtn) repeatBtn.onclick = () => {
        const badge = document.getElementById('repeat-badge');
        repeatState = (repeatState + 1) % 3;
        if(repeatState === 0) { repeatBtn.style.color = '#fff'; badge.classList.add('hidden'); }
        else if (repeatState === 1) { repeatBtn.style.color = '#5c20f7'; badge.classList.remove('hidden'); badge.innerHTML = 'All'; }
        else { repeatBtn.style.color = '#5c20f7'; badge.classList.remove('hidden'); badge.innerHTML = '1'; }
    };

    // Shuffle
    const shuffleBtn = document.getElementById('shuffle-btn');
    if(shuffleBtn) shuffleBtn.onclick = () => {
        if(currentPlaylist.length > 0) {
            currentPlaylist = [...currentPlaylist].sort(() => Math.random() - 0.5);
            currentIndex = 0;
            loadSong(currentPlaylist[0]);
            safePlay();
        }
    };

    // Ses Kontrolü
    const volSlider = document.getElementById('volume-slider');
    const muteBtn = document.getElementById('mute-btn');
    let lastVolume = 1;

    if(volSlider) {
        volSlider.addEventListener('input', () => {
            const val = parseFloat(volSlider.value);
            audio.volume = val;
            if(val > 0 && audio.muted) audio.muted = false;
            updateVolumeUI(val, audio.muted);
        });
    }

    if(muteBtn) {
        muteBtn.onclick = () => {
            if(audio.muted || audio.volume === 0) {
                audio.muted = false;
                if(lastVolume === 0) lastVolume = 0.5;
                audio.volume = lastVolume;
                volSlider.value = lastVolume;
            } else {
                lastVolume = audio.volume;
                audio.muted = true;
                audio.volume = 0;
                volSlider.value = 0;
            }
            updateVolumeUI(audio.volume, audio.muted);
        };
    }

    // Add to Playlist
    const addPlBtn = document.getElementById('add-to-playlist-btn');
    if(addPlBtn) {
        addPlBtn.onclick = (e) => {
            e.stopPropagation();
            if(currentPlaylist[currentIndex]) addSongToPlaylistModal(currentPlaylist[currentIndex]);
            else alert("Önce bir şarkı çalın!");
        };
    }
}

function updateVolumeUI(volume, isMuted) {
    const muteBtn = document.getElementById('mute-btn');
    const slider = document.getElementById('volume-slider');
    if(!muteBtn || !slider) return;

    if(isMuted || volume === 0) muteBtn.innerHTML = '<i class="fa-solid fa-volume-xmark"></i>';
    else if(volume < 0.5) muteBtn.innerHTML = '<i class="fa-solid fa-volume-low"></i>';
    else muteBtn.innerHTML = '<i class="fa-solid fa-volume-high"></i>';

    const percentage = volume * 100;
    slider.style.backgroundSize = `${percentage}% 100%`;
}

// =======================================================
// 5. ANA SAYFA & VİTRİN
// =======================================================
function renderHomeView() {
    setActiveMenu('home-link');
    
    // 1. Temel Veriler
    const hour = new Date().getHours();
    const greeting = hour < 12 ? "Günaydın" : hour < 18 ? "İyi Günler" : "İyi Akşamlar";
    const userName = localStorage.getItem('userName') || "Kaptan";

    // 2. Şarkı Listeleri Hazırlığı
    let featuredSong = allSongs.length > 0 ? allSongs[Math.floor(Math.random() * allSongs.length)] : null;
    const recentSongs = [...allSongs].reverse().slice(0, 10);
    const myPlaylistsRev = [...myPlaylists].reverse();

    // 3. TOZLU RAFLAR MANTIĞI (Mantık HTML'den önce kurulmalı!) 🕸️
    const recentIds = recentSongs.map(s => s.id);
    // Favori olmayan ve son dinlenenlerde olmayanları bul
    const dustyCandidates = allSongs.filter(s => !favorites.includes(s.id) && !recentIds.includes(s.id));
    
    let dustySong = null;
    if (dustyCandidates.length > 0) {
        dustySong = dustyCandidates[Math.floor(Math.random() * dustyCandidates.length)];
    } else if (allSongs.length > 5) {
        // Eğer aday yoksa ama kütüphane doluysa rastgele al
        dustySong = allSongs[Math.floor(Math.random() * allSongs.length)];
    }
//Zenci göt
    // 4. HTML OLUŞTURMA
    mainView.innerHTML = `
        <div class="dashboard-wrapper">
            <h1 style="font-size: 2.5rem; margin-bottom: 5px;">${greeting}, ${userName}</h1>
            <p style="color:#aaa; margin-bottom: 30px;">Bugün hangi moddasın?</p>

            <div class="mood-grid">
                <div class="mood-card energetic" onclick="filterByMood('energetic', 'Enerjik ⚡')"><h3>Enerjik</h3><i class="fa-solid fa-bolt"></i></div>
                <div class="mood-card sad" onclick="filterByMood('sad', 'Hüzünlü 🌧️')"><h3>Hüzünlü</h3><i class="fa-solid fa-cloud-rain"></i></div>
                <div class="mood-card chill" onclick="filterByMood('chill', 'Chill ☕')"><h3>Chill</h3><i class="fa-solid fa-mug-hot"></i></div>
                <div class="mood-card focus" onclick="filterByMood('focus', 'Odaklan 🧠')"><h3>Odaklan</h3><i class="fa-solid fa-brain"></i></div>
            </div>

            ${allSongs.length > 3 ? `
            <div class="daily-mix-wrapper">
                <div class="daily-mix-card" onclick="playDailyMix()">
                    <div class="daily-mix-content"><h2>Günün Miksi</h2><p>Senin için rastgele seçilmiş şarkılar</p></div>
                    <div class="daily-mix-icon"><i class="fa-solid fa-shuffle"></i></div>
                </div>
            </div>` : ''}

            ${myPlaylistsRev.length > 0 ? `
                <div class="section-title" style="font-size: 1.5rem; margin-bottom: 25px;">Senin Listelerin</div>
                <div class="playlist-grid">
                    ${myPlaylistsRev.map(pl => `
                        <div class="home-playlist-card" onclick="openPlaylistFromHome('${pl.id}')">
                            <div class="pl-card-img-wrapper">
                                <i class="fa-solid fa-compact-disc default-pl-icon"></i>
                                <img id="home-pl-img-${pl.id}" src="" class="pl-card-img">
                            </div>
                            <div class="pl-card-play-btn"><i class="fa-solid fa-play"></i></div>
                            <div class="pl-card-title">${pl.name}</div>
                            <div class="pl-card-info">${pl.songs.length} Şarkı</div>
                        </div>
                    `).join('')}
                </div>` : ''}
    
            ${featuredSong ? `
            <div class="section-title">Günün Önerisi</div>
            <div class="hero-card">
                <img src="${featuredSong.cover}" class="hero-img">
                <div class="hero-content">
                    <span class="hero-badge">Öne Çıkan</span>
                    <h2 style="font-size: 1.8rem; margin: 10px 0;">${featuredSong.name}</h2>
                    <p style="color:rgba(255,255,255,0.8); font-size:1rem;">${featuredSong.artist}</p>
                    <button class="hero-btn" onclick="playFeaturedSong('${featuredSong.id}')"><i class="fa-solid fa-play"></i> Hemen Dinle</button>
                </div>
            </div>` : ''}

            ${dustySong ? `
            <div class="dusty-wrapper" style = "margin-bottom: 30px">
                <div class="section-title" style="color:#d35400; border-color:rgba(211, 84, 0, 0.2);">
                    <i class="fa-solid fa-box-open"></i> Tozlu Raflar
                </div>
                <div class="dusty-card" onclick="playFeaturedSong('${dustySong.id}')">
                    <div class="dusty-badge"><i class="fa-solid fa-spider"></i> Unutulanlar</div>
                    <img src="${dustySong.cover}" class="dusty-img">
                    <div class="dusty-info">
                        <h3>${dustySong.name}</h3>
                        <p>${dustySong.artist}</p>
                        <div style="margin-top:5px; font-size:0.75rem; color:rgba(255,255,255,0.3); font-style:italic;">
                            "Beni hatırladın mı?"
                        </div>
                    </div>
                    <div style="margin-left:auto; background:rgba(255,255,255,0.1); width:40px; height:40px; border-radius:50%; display:flex; align-items:center; justify-content:center;">
                        <i class="fa-solid fa-play" style="color:#e6b0aa;"></i>
                    </div>
                </div>
            </div>` : ''}

            ${recentSongs.length > 0 ? `
            <div class="section-title">Son Eklenenler</div>
            <div class="horizontal-scroll-container">
                ${recentSongs.map(song => `
                    <div class="mini-song-card" onclick="playFeaturedSong('${song.id}')">
                        <img src="${song.cover}" class="mini-cover">
                        <div class="mini-title">${song.name}</div>
                        <div class="mini-artist">${song.artist}</div>
                    </div>`).join('')}
            </div>` : ''}

            <h3 style="margin-bottom: 15px; border-top:1px solid rgba(255,255,255,0.1); padding-top:20px; margin-top:30px;">Hızlı İşlemler</h3>
            
            <div class="quick-actions-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 15px;">
                <div class="upload-box" id="upload-area">
                    <i class="fa-solid fa-cloud-arrow-up" style="font-size:2rem; color:var(--primary-color); margin-bottom:15px;"></i>
                    <h3>Yükle</h3>
                </div>

                <div class="upload-box" id="create-story-btn" onclick="createInstaStory()" style="border-color: #e1306c;">
                    <i class="fa-brands fa-instagram" style="font-size:2rem; color:#e1306c; margin-bottom:15px;"></i>
                    <h3>Story</h3>
                </div>

                <div class="upload-box" id="karaoke-btn" onclick="toggleKaraoke()" style="border-color: #f1c40f;">
                    <i class="fa-solid fa-microphone-lines" style="font-size:2rem; color:#f1c40f; margin-bottom:15px;"></i>
                    <h3 id="karaoke-text">Karaoke</h3>
                </div>

                <div class="upload-box" id="chill-btn" onclick="toggleChillMode()" style="border-color: #00d2d3;">
                    <i class="fa-regular fa-snowflake" style="font-size:2rem; color:#00d2d3; margin-bottom:15px;"></i>
                    <h3 id="chill-text">Chill Mod</h3>
                </div>

                <div class="upload-box" onclick="toggleAmbiencePanel()" style="border-color: #9b59b6;">
                    <i class="fa-solid fa-sliders" style="font-size:2rem; color:#9b59b6; margin-bottom:15px;"></i>
                    <h3>Ambiyans</h3>
                </div>

                <div class="upload-box" onclick="openSceneModal()" style="border-color: #e67e22;">
                    <i class="fa-solid fa-film" style="font-size:2rem; color:#e67e22; margin-bottom:15px;"></i>
                    <h3>Sahne</h3>
                </div>
            </div>  

        </div>
    `;

    // 5. Kapakları Yükle (Async)
    myPlaylistsRev.forEach(pl => {
        const img = document.getElementById(`home-pl-img-${pl.id}`);
        if(img) setCoverImageFromDB(pl.id, img);
    });

    bindUploadArea();
    updateMobileNav('nav-home');
}

function bindUploadArea() {
    const area = document.getElementById('upload-area');
    if(!area) return;
    area.onclick = () => fileInput.click();
    area.ondragover = (e) => { e.preventDefault(); area.style.borderColor = '#2ecc71'; };
    area.ondragleave = () => { area.style.borderColor = 'rgba(255,255,255,0.2)'; };
    area.ondrop = (e) => { e.preventDefault(); if(e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); };
}

window.playDailyMix = function() {
    if(allSongs.length === 0) return alert("H hiç şarkı yok!");
    const mix = [...allSongs].sort(() => 0.5 - Math.random()).slice(0, 15);
    currentPlaylist = mix; currentIndex = 0; loadSong(mix[0]); safePlay();
}

window.playFeaturedSong = function(id) {
    const song = allSongs.find(s => s.id == id);
    if(song) { currentPlaylist = [song]; currentIndex=0; loadSong(song); safePlay(); }
}

window.openPlaylistFromHome = function(id) {
    const pl = myPlaylists.find(p => p.id == id);
    if(pl) { setActiveMenu(`playlist-item-${pl.id}`); const listSongs = allSongs.filter(s => pl.songs.includes(s.id)); renderPlaylistView(pl.name, listSongs, 'userPlaylist'); }
}

function filterByMood(moodKey, title) {
    setActiveMenu(`mood-${moodKey}`);
    const filtered = allSongs.filter(s => s.mood === moodKey);
    renderPlaylistView(title, filtered, 'moodList');
}

// =======================================================
// 6. LİSTE GÖRÜNÜMÜ & SAĞ TIK
// =======================================================
function renderPlaylistView(title, songs, listType = 'standard') {
    let coverHTML = `<i class="fa-solid fa-music"></i>`;
    const currentPlObj = myPlaylists.find(p => p.name === title);
    
    if(listType === 'userPlaylist' && currentPlObj) {
        coverHTML = `<img id="view-cover-${currentPlObj.id}" src="" style="width:100%;height:100%;object-fit:cover;display:none;">`;
        setTimeout(() => {
            const el = document.getElementById(`view-cover-${currentPlObj.id}`);
            if(el) { setCoverImageFromDB(currentPlObj.id, el); el.onload = () => el.style.display = 'block'; }
        }, 0);
    }

    let extraBtns = listType === 'userPlaylist' ? 
        `<button class="action-btn" onclick="openEditModal('${title}')" title="Düzenle"><i class="fa-solid fa-pen"></i></button>
         <button class="action-btn" onclick="deletePlaylist('${title}')" title="Sil" style="color:#e74c3c!important"><i class="fa-solid fa-trash-can"></i></button>` : '';

    mainView.innerHTML = `
        <div class="playlist-view-header">
            <div class="playlist-cover-art">${coverHTML}</div>
            <div>
                <h4 style="font-size:0.8rem; letter-spacing:2px;">ÇALMA LİSTESİ</h4>
                <h1 style="font-size:3rem; font-weight:700;">${title}</h1>
                <div style="color:#ccc; margin-top:5px;">${songs.length} Şarkı</div>
            </div>
        </div>
        <div class="playlist-actions">
            <button class="play-all-btn" id="list-play-btn"><i class="fa-solid fa-play"></i></button>
            <button id="list-shuffle-btn" style="background:none;border:none;color:#fff;font-size:1.5rem;"><i class="fa-solid fa-shuffle"></i></button>
            ${extraBtns}
        </div>
        <table class="song-list-table">
            <thead><tr><th width="40">#</th><th>Başlık</th><th>Sanatçı</th><th width="100">İşlemler</th></tr></thead>
            <tbody id="song-list-body"></tbody>
        </table>
    `;

    const tbody = document.getElementById('song-list-body');
    songs.forEach((song, idx) => {
        const tr = document.createElement('tr');
        tr.className = 'song-row';

        tr.dataset.id = song.id;

        if(listType === 'userPlaylist') { tr.draggable = true; setupDragEvents(tr, title, songs); tr.dataset.index = idx; }
        if(currentPlaylist[currentIndex] && currentPlaylist[currentIndex].id === song.id) tr.classList.add('active-song');

        let moodIcon = '';
        if(song.mood) {
            const icons = { energetic:'⚡', sad:'🌧️', chill:'☕', focus:'🧠' };
            moodIcon = `<span title="${song.mood}" style="margin-left:8px;font-size:0.8rem;">${icons[song.mood]||''}</span>`;
        }

        // Akıllı Sağ Tık
        if(listType === 'uploads') {
            tr.oncontextmenu = (e) => {
                e.preventDefault();
                contextMenuTargetId = song.id;
                const menu = document.getElementById('context-menu');
                menu.classList.remove('hidden');
                
                const menuH = menu.offsetHeight;
                const winH = window.innerHeight;
                if(winH - e.clientY < menuH + 50) {
                    menu.style.top = `${e.pageY - menuH}px`;
                    menu.classList.add('opens-up');
                } else {
                    menu.style.top = `${e.pageY}px`;
                    menu.classList.remove('opens-up');
                }
                menu.style.left = `${e.pageX}px`;
            };
        }

        let actions = '';
        if(listType === 'uploads') actions = `<button class="action-btn btn-add"><i class="fa-solid fa-plus"></i></button><button class="action-btn btn-del"><i class="fa-solid fa-trash"></i></button>`;
        if(listType === 'userPlaylist') actions = `<button class="action-btn btn-del"><i class="fa-solid fa-circle-minus"></i></button>`;

        tr.innerHTML = `<td>${idx+1}</td><td class="song-title-cell"><img src="${song.cover}"> ${song.name} ${moodIcon}</td><td>${song.artist}</td><td>${actions}</td>`;
        
        tr.onclick = () => { currentPlaylist=[...songs]; currentIndex=idx; loadSong(song); safePlay(); };
        const delBtn = tr.querySelector('.btn-del');
        const addBtn = tr.querySelector('.btn-add');
        if(delBtn) delBtn.onclick = (e) => { e.stopPropagation(); listType==='uploads' ? deleteSongFromDB(song.id) : removeSongFromPlaylist(title, song.id); };
        if(addBtn) addBtn.onclick = (e) => { e.stopPropagation(); addSongToPlaylistModal(song); };
        
        tbody.appendChild(tr);
    });

    document.getElementById('list-play-btn').onclick = () => { if(songs.length){ currentPlaylist=[...songs]; currentIndex=0; loadSong(songs[0]); safePlay(); } };
    document.getElementById('list-shuffle-btn').onclick = () => { if(songs.length){ currentPlaylist=[...songs].sort(()=>Math.random()-0.5); currentIndex=0; loadSong(currentPlaylist[0]); safePlay(); } };
}

function setupDragEvents(row, playlistName, currentList) {
    row.ondragstart = (e) => { row.classList.add('dragging'); e.dataTransfer.setData('idx', row.dataset.index); };
    row.ondragend = () => { row.classList.remove('dragging'); document.querySelectorAll('.drag-over').forEach(r=>r.classList.remove('drag-over')); };
    row.ondragover = (e) => { e.preventDefault(); row.classList.add('drag-over'); };
    row.ondragleave = () => row.classList.remove('drag-over');
    row.ondrop = (e) => {
        e.preventDefault();
        const fromIdx = parseInt(e.dataTransfer.getData('idx'));
        const toIdx = parseInt(row.dataset.index);
        if(fromIdx === toIdx) return;
        const item = currentList[fromIdx];
        currentList.splice(fromIdx, 1);
        currentList.splice(toIdx, 0, item);
        const pl = myPlaylists.find(p => p.name === playlistName);
        if(pl) {
            pl.songs = currentList.map(s => s.id);
            localStorage.setItem('myPlaylists', JSON.stringify(myPlaylists));
            renderPlaylistView(playlistName, currentList, 'userPlaylist');
        }
    };
}

// =======================================================
// 7. DB & DOSYA
// =======================================================
function setupDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(dbName, 3); // Versiyon 3 (Güncelledik)

        // Veritabanı ilk kez oluşurken veya versiyon artınca çalışır
        request.onupgradeneeded = (e) => {
            db = e.target.result;
            // Şarkılar için depo
            if (!db.objectStoreNames.contains(storeName)) {
                db.createObjectStore(storeName, { keyPath: "id", autoIncrement: true });
            }
            // Kapak resimleri için depo
            if (!db.objectStoreNames.contains(coverStoreName)) {
                db.createObjectStore(coverStoreName);
            }
        };

        request.onsuccess = (e) => {
            db = e.target.result;
            console.log("✅ Veritabanı Bağlandı: MoodPlayerDB");
            loadAllData(); // Bağlanınca verileri yükle
            resolve(db);
        };

        request.onerror = (e) => {
            console.error("❌ Veritabanı Hatası:", e.target.error);
            reject(e.target.error);
        };
    });
}

// 2. Tüm Verileri (Şarkıları) Yükle ve Ekrana Bas
function loadAllData() {
    if (!db) return;

    const tx = db.transaction([storeName], "readonly");
    const store = tx.objectStore(storeName);
    const request = store.getAll();

    request.onsuccess = (e) => {
        const savedSongs = e.target.result;
        
        // Şarkıları global listeye at
        // ÖNEMLİ: Blob (Dosya) verisini çalınabilir URL'e çeviriyoruz
        allSongs = savedSongs.map(song => {
            let playableUrl = song.path; // Eğer web linkiyse (URL) olduğu gibi kalır
            
            // Eğer veritabanında dosya (Blob) olarak saklanmışsa:
            if (song.blob && song.blob instanceof Blob) {
                playableUrl = URL.createObjectURL(song.blob);
            }
            
            return { ...song, path: playableUrl };
        });

        console.log(`📂 Hafızadan ${allSongs.length} şarkı yüklendi.`);
        
        // Arayüzü Güncelle (Hangi sayfadaysak orayı yenilesin)
        if (typeof renderHomeView === 'function') renderHomeView();
        if (typeof renderSidebar === 'function') renderSidebar();
    };
}

/* =========================================
   DOSYA İŞLEME (HANDLE FILE) 🎵
   ========================================= */
function handleFile(file) {
    if (!file.type.startsWith('audio/')) {
        return showNotification("Hata", "error", "Sadece ses dosyası yükleyebilirsin!");
    }

    // Geçici bilgi mesajı
    showNotification("İşleniyor...", "info", "Dosya okunuyor ve kaydediliyor.");

    // Varsayılan Şarkı Verisi
    let songData = { 
        name: file.name.replace(/\.[^/.]+$/, ""), // Uzantıyı (.mp3) sil
        artist: "Bilinmeyen Sanatçı", 
        cover: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=300&q=80", 
        blob: file, // 👈 İŞTE SİHİR BURADA: Dosyanın kendisini saklıyoruz!
        category: 'userUploads', 
        dateAdded: Date.now(),
        mood: 'chill' // Varsayılan mod
    };

    // Metadata Okuma (jsmediatags kütüphanesi varsa)
    if (window.jsmediatags) {
        window.jsmediatags.read(file, {
            onSuccess: (tag) => {
                // Etiketleri al
                if (tag.tags.title) songData.name = tag.tags.title;
                if (tag.tags.artist) songData.artist = tag.tags.artist;
                
                // Kapak resmi varsa al
                if (tag.tags.picture) {
                    const { data, format } = tag.tags.picture;
                    let base64String = "";
                    for (let i = 0; i < data.length; i++) {
                        base64String += String.fromCharCode(data[i]);
                    }
                    songData.cover = `data:${format};base64,${window.btoa(base64String)}`;
                }
                
                // VERİTABANINA KAYDET
                saveSongToDB(songData);
            },
            onError: (error) => {
                console.log("Tag okuma hatası, varsayılanlarla kaydediliyor:", error);
                // Hata olsa bile kaydet
                saveSongToDB(songData);
            }
        });
    } else {
        // Kütüphane yoksa direkt kaydet
        saveSongToDB(songData);
    }
}

// 3. Şarkı Kaydetme Fonksiyonu (Otomatik Çalışacak)
function saveSongToDB(songData) {
    if (!db) return;

    const tx = db.transaction([storeName], "readwrite");
    const store = tx.objectStore(storeName);
    
    // Veriyi ekle
    const request = store.add(songData);

    request.onsuccess = (e) => {
        const newId = e.target.result;
        songData.id = newId; // Yeni ID'yi ata
        
        // Blob varsa URL oluştur
        if (songData.blob) {
            songData.path = URL.createObjectURL(songData.blob);
        }
        
        // RAM'deki listeye de ekle
        allSongs.push(songData);
        
        showNotification("Kaydedildi", "success", "Şarkı hafızaya alındı.");
        
        // Listeleri yenile
        if (typeof renderSidebar === 'function') renderSidebar();
    };

    request.onerror = (e) => {
        console.error("Kayıt Hatası:", e.target.error);
        showNotification("Hata", "error", "Şarkı kaydedilemedi (Kota dolmuş olabilir).");
    };
}

// 4. Şarkı Silme Fonksiyonu
function deleteSongFromDB(id) {
    const tx = db.transaction([storeName], "readwrite");
    const store = tx.objectStore(storeName);
    
    store.delete(id).onsuccess = () => {
        // RAM'den de sil
        allSongs = allSongs.filter(s => s.id !== id);
        // Playistlerden de sil
        myPlaylists.forEach(pl => {
            pl.songs = pl.songs.filter(sId => sId !== id);
        });
        localStorage.setItem('myPlaylists', JSON.stringify(myPlaylists));
        
        showNotification("Silindi", "info", "Şarkı kalıcı olarak silindi.");
        renderSidebar(); // Kenar çubuğunu yenile
        // Eğer şu an 'Eklediklerim' sayfasındaysak orayı yenile
        const uploadsLink = document.getElementById('uploads-link');
        if(uploadsLink && uploadsLink.classList.contains('active')) uploadsLink.click();
    };
}

// =======================================================
// 8. SIDEBAR & MENÜ (DÜZELTİLMİŞ VERSİYON) ✅
// =======================================================
function renderSidebar() {
    const ul = document.getElementById('user-playlists');
    ul.innerHTML = '';
    
    // 1. Listeleri Ekrana Bas
    myPlaylists.forEach(pl => {
        const li = document.createElement('li');
        li.className = 'playlist-item'; 
        li.id = `playlist-item-${pl.id}`;
        
        // Resim ve İsim HTML'i
        li.innerHTML = `<img id="side-img-${pl.id}" src="" class="sidebar-pl-img" style="display:none"> ${pl.name}`;
        
        // Resmi veritabanından çek
        const img = li.querySelector('img');
        setCoverImageFromDB(pl.id, img);
        img.onload = () => img.style.display = 'inline-block';
        
        // Tıklama Olayı (Listeyi Aç)
        li.onclick = () => {
            setActiveMenu(`playlist-item-${pl.id}`);
            const listSongs = allSongs.filter(s => pl.songs.includes(s.id));
            renderPlaylistView(pl.name, listSongs, 'userPlaylist');
        };
        ul.appendChild(li);
    });

    // 2. Sabit Menü Linklerini Bağla
    const homeLink = document.getElementById('home-link');
    if(homeLink) homeLink.onclick = renderHomeView;

    const favLink = document.getElementById('favorites-link');
    if(favLink) favLink.onclick = () => { 
        setActiveMenu('favorites-link'); 
        renderPlaylistView('Beğenilenler', allSongs.filter(s=>favorites.includes(s.id)), 'standard'); 
    };

    const uploadsLink = document.getElementById('uploads-link');
    if(uploadsLink) uploadsLink.onclick = () => { 
        setActiveMenu('uploads-link'); 
        renderPlaylistView('Eklediklerim', allSongs.filter(s=>s.category==='userUploads'), 'uploads'); 
    };

    // 3. "Yeni Liste" Butonunu DÜZGÜN Bağla (Hata buradaydı, çözüldü)
    const createBtn = document.getElementById('create-playlist-btn');
    if(createBtn) {
        // Eski olayları temizlemek için butonu klonluyoruz (Ghost click önlemi)
        const newBtn = createBtn.cloneNode(true);
        createBtn.parentNode.replaceChild(newBtn, createBtn);

        // Yeni tıklama olayı (Sadece tıklandığında çalışır!)
        newBtn.onclick = () => {
            openInputModal(
                "Yeni Liste Oluştur",      // Başlık
                "Örn: Gece Yolculuğu",     // Placeholder
                "Oluştur",                 // Buton Yazısı
                (name) => {                // Onaylanınca çalışacak kod
                    const newPl = { id: Date.now(), name: name, songs: [] };
                    myPlaylists.push(newPl);
                    localStorage.setItem('myPlaylists', JSON.stringify(myPlaylists));
                    
                    renderSidebar(); // Listeyi yenile
                    showNotification("Başarılı", "success", `"${name}" listesi oluşturuldu.`);
                    
                    // Yeni oluşturulan listeyi hemen aç
                    openPlaylistFromHome(newPl.id);
                }
            );
        };
    }
    
    // 4. Arama Motoru Entegrasyonu
    const searchInp = document.getElementById('search-input');
    // Not: Arama motoru yaması altta çalıştığı için buraya ek kod gerekmez,
    // ama searchInp null kontrolü yapmak iyidir.
}

/* =========================================
   3 KATMANLI ARAMA EKRANI
   ========================================= */
function renderSearchView(term, localSongs) {
    mainView.innerHTML = `
        <div class="search-header"><h2>🔍 "${term}"</h2></div>
        
        <div class="section-title" style="margin-top:10px; color:var(--primary-color);">Kütüphanem (${localSongs.length})</div>
        <div class="search-grid" id="search-res"></div>
        
        <div class="section-title" style="margin-top:30px; border-top:1px solid rgba(255,255,255,0.1); padding-top:20px;">
            <i class="fa-solid fa-box-archive"></i> Web Sonuçları (Archive.org)
        </div>
        <div class="search-grid" id="archive-search-results">
            <p style="color:#aaa;">Aranıyor...</p>
        </div>

        <div class="section-title" style="margin-top:30px; border-top:1px solid rgba(255,255,255,0.1); padding-top:20px;">
            <i class="fa-brands fa-apple"></i> Demolar (iTunes 30sn)
        </div>
        <div class="search-grid" id="itunes-search-results">
            <p style="color:#aaa;">Aranıyor...</p>
        </div>
    `;

    // Yerel sonuçları doldur
    const grid = document.getElementById('search-res');
    if(localSongs.length === 0) grid.innerHTML = '<p style="color:#666;">Kütüphanende yok.</p>';
    
    localSongs.forEach((s, i) => {
        const d = document.createElement('div'); d.className = 'song-card';
        d.innerHTML = `<div class="card-img-wrapper"><img src="${s.cover}"><div class="card-play-btn"><i class="fa-solid fa-play"></i></div></div><div class="card-title">${s.name}</div><div class="card-artist">${s.artist}</div>`;
        d.onclick = () => { currentPlaylist=[...localSongs]; currentIndex=i; loadSong(s); safePlay(); };
        grid.appendChild(d);
    });
}

function setActiveMenu(id) {
    document.querySelectorAll('.menu-item, .playlist-item').forEach(e => e.classList.remove('active'));
    const el = document.getElementById(id);
    if(el) el.classList.add('active');
}

// =======================================================
// 9. AYARLAR & MODALLAR & DİĞERLERİ
// =======================================================
window.switchTab = function(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    
    const btns = document.querySelectorAll('.tab-btn');
    if(tabId==='tab-general') btns[0].classList.add('active');
    if(tabId==='tab-audio') btns[1].classList.add('active');
    if(tabId==='tab-system') btns[2].classList.add('active');
}

function setupVisualizerCanvas() {
    canvas = document.getElementById('visualizer');
    ctx = canvas.getContext('2d');
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    const len = analyser.frequencyBinCount;
    const arr = new Uint8Array(len);
    animateVisualizer(len, arr);
}
function resizeCanvas() { if(canvas) { canvas.width = canvas.parentElement.offsetWidth; canvas.height = canvas.parentElement.offsetHeight; } }
/* =========================================
   GÖRSELLEŞTİRİCİ (KİBARLAŞTIRILMIŞ VERSİYON)
   ========================================= */
function animateVisualizer(len, arr) {
    // 1. Kapanış Animasyonu Kontrolü
    if(localStorage.getItem('visualizerState') === 'off') { 
        let allZero = true;
        for(let i=0; i<len; i++) {
            arr[i] = Math.floor(arr[i] * 0.8); // Yavaşça söndür
            if(arr[i] > 0) allZero = false;
        }
        if(allZero) { ctx.clearRect(0, 0, canvas.width, canvas.height); return; }
    } else {
        // Açıksa veriyi çek
        analyser.getByteFrequencyData(arr);
    }

    // Döngü
    requestAnimationFrame(() => animateVisualizer(len, arr));
    
    // Temizlik
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Çizim
    const barW = (canvas.width / len) * 2.5; 
    let x = 0;
    
    // Gölge Efekti
    ctx.shadowBlur = 10; // Gölgeyi de biraz azalttım, göz yormasın
    ctx.shadowColor = "rgba(0, 255, 255, 0.5)"; 

    for(let i=0; i<len; i++) {
        // --- İŞTE SİHİRLİ DOKUNUŞ BURADA ---
        // Sesi ekran boyuna göre oranla ve %70'ini kullan (Daha basık ve şık durur)
        const barH = (arr[i] / 255) * canvas.height * 0.7;
        
        if(barH > 0) {
            let grad = ctx.createLinearGradient(0, canvas.height, 0, canvas.height - barH);
            grad.addColorStop(0, "rgba(92, 32, 247, 0.8)");
            grad.addColorStop(1, "rgba(0, 255, 255, 0.9)");
            
            ctx.fillStyle = grad;
            ctx.beginPath(); 
            ctx.roundRect(x, canvas.height - barH, barW - 2, barH, [5,5,0,0]); 
            ctx.fill();
        }
        x += barW + 1;
    }
}

const eqInputs = ['bass-boost','eq-low','eq-mid','eq-high'];
eqInputs.forEach(id => {
    const el = document.getElementById(id);
    if(el) el.oninput = (e) => {
        const v = parseFloat(e.target.value);
        if(id==='bass-boost' && bassBoostNode) bassBoostNode.gain.value = v;
        if(id==='eq-low' && eqLowNode) eqLowNode.gain.value = v;
        if(id==='eq-mid' && eqMidNode) eqMidNode.gain.value = v;
        if(id==='eq-high' && eqHighNode) eqHighNode.gain.value = v;
        localStorage.setItem(id.replace('-','_'), v);
    }
});

document.addEventListener('click', () => { if(document.getElementById('context-menu')) document.getElementById('context-menu').classList.add('hidden'); });
/* =========================================
   GELİŞMİŞ İSİM DEĞİŞTİRME (ŞARKI + SANATÇI) ✏️
   ========================================= */
if(document.getElementById('ctx-rename')) {
    document.getElementById('ctx-rename').onclick = () => {
        // 1. Menüyü kapat
        document.getElementById('context-menu').classList.add('hidden');

        // 2. Hedef şarkıyı bul
        const s = allSongs.find(x => x.id === contextMenuTargetId);
        if(!s) return;

        // 3. Özel Modal Oluştur (Çift Inputlu)
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay temp-ui';
        overlay.innerHTML = `
            <div class="modal-content" style="width:350px; text-align:left;">
                <h3 style="margin-bottom:20px; text-align:center;">Düzenle</h3>
                
                <label style="font-size:0.8rem; color:#aaa; margin-bottom:5px; display:block;">Şarkı Adı</label>
                <input type="text" id="rename-title" value="${s.name}" style="width:100%; padding:10px; margin-bottom:15px; background:rgba(255,255,255,0.1); border:1px solid rgba(255,255,255,0.2); color:#fff; border-radius:5px;">
                
                <label style="font-size:0.8rem; color:#aaa; margin-bottom:5px; display:block;">Sanatçı</label>
                <input type="text" id="rename-artist" value="${s.artist}" style="width:100%; padding:10px; margin-bottom:25px; background:rgba(255,255,255,0.1); border:1px solid rgba(255,255,255,0.2); color:#fff; border-radius:5px;">
                
                <div style="display:flex; justify-content:flex-end; gap:10px;">
                    <button class="modal-btn cancel">İptal</button>
                    <button class="modal-btn save" style="background:var(--primary-color);">Kaydet</button>
                </div>
            </div>`;

        document.body.appendChild(overlay);
        
        // Görünür yap
        setTimeout(() => overlay.style.display = 'flex', 10);

        // --- BUTON İŞLEVLERİ ---
        const close = () => overlay.remove();
        
        // KAYDETME İŞLEMİ
        overlay.querySelector('.save').onclick = () => {
            const newName = document.getElementById('rename-title').value.trim();
            const newArtist = document.getElementById('rename-artist').value.trim();

            if(newName && newArtist) {
                // Veritabanını Güncelle
                db.transaction([storeName],"readwrite").objectStore(storeName).get(s.id).onsuccess = (e) => {
                    const data = e.target.result; 
                    data.name = newName; 
                    data.artist = newArtist;
                    
                    db.transaction([storeName],"readwrite").objectStore(storeName).put(data).onsuccess = () => { 
                        // RAM'deki veriyi güncelle
                        s.name = newName; 
                        s.artist = newArtist; 
                        
                        // Ekranı yenile (Hangi sayfadaysan orayı)
                        const activeLink = document.querySelector('.menu-item.active');
                        if(activeLink) activeLink.click(); 
                        else renderHomeView();

                        showNotification("Güncellendi", "success", "Şarkı bilgileri değiştirildi.");
                        close();
                    };
                };
            } else {
                showNotification("Hata", "warning", "Alanlar boş bırakılamaz.");
            }
        };

        overlay.querySelector('.cancel').onclick = close;
    };
}

['energetic','sad','chill','focus'].forEach(m => {
    
    // 1. Sağ Tık Menüsündeki Mod Atama İşlemleri
    if(document.getElementById(`ctx-mood-${m}`)) {
        document.getElementById(`ctx-mood-${m}`).onclick = () => {
            const s = allSongs.find(x => x.id === contextMenuTargetId);
            if(s) {
                db.transaction([storeName],"readwrite").objectStore(storeName).get(s.id).onsuccess = (e) => {
                    const d = e.target.result; d.mood = m;
                    db.transaction([storeName],"readwrite").objectStore(storeName).put(d).onsuccess = () => { s.mood = m; renderHomeView(); };
                };
            }
        };
    }

    // 2. Yan Menüdeki (Sidebar) Tıklama İşlemleri -- DÜZELTİLEN KISIM --
    const sidebarMoodBtn = document.getElementById(`mood-${m}`);
    if(sidebarMoodBtn) {
        // İngilizce kelime yerine bu güzel başlıkları kullanacağız
        const trTitles = {
            energetic: 'Enerjik ⚡',
            sad: 'Hüzünlü 🌧️',
            chill: 'Chill ☕',
            focus: 'Odaklan 🧠'
        };
        
        sidebarMoodBtn.onclick = () => filterByMood(m, trTitles[m]);
    }
});

/* =========================================
   1. AYARLAR YÜKLEYİCİ (YUMUŞAK GEÇİŞ İÇİN DÜZELTİLDİ)
   ========================================= */
function loadSettings() {
    // Tema Rengi
    const color = localStorage.getItem('themeColor');
    if(color) { 
        document.documentElement.style.setProperty('--primary-color', color); 
        document.documentElement.style.setProperty('--hover-color', color); 
    }

    // Visualizer Ayarı
    const vizToggle = document.getElementById('visualizer-toggle');
    
    // Varsayılan 'on'
    const savedState = localStorage.getItem('visualizerState');
    const isOn = (savedState !== 'off'); 

    if(vizToggle) {
        vizToggle.checked = isOn;
        
        vizToggle.onchange = (e) => {
            const isChecked = e.target.checked;
            localStorage.setItem('visualizerState', isChecked ? 'on' : 'off');
            
            // Eğer AÇILDIYSA ve döngü durmuşsa, yeniden ateşle!
            if(isChecked && analyser) {
                const len = analyser.frequencyBinCount;
                const arr = new Uint8Array(len);
                animateVisualizer(len, arr);
            }
            // KAPANINCA hiçbir şey yapma, bırak animasyon fonksiyonu (aşağıdaki) 
            // barları yavaşça indirip kendi kendini durdursun.
        };
    }

    /* =========================================
   YUMUŞAK GEÇİŞ (CROSSFADE) AYARLARI 🎚️
   ========================================= */
document.addEventListener('DOMContentLoaded', () => {
    const fadeToggle = document.getElementById('crossfade-toggle');
    
    if(fadeToggle) {
        // 1. Sayfa açılınca durumu yükle
        const savedState = localStorage.getItem('useCrossfade') === 'on';
        fadeToggle.checked = savedState;

        // 2. Değişikliği dinle ve kaydet
        fadeToggle.onchange = (e) => {
            const isOn = e.target.checked;
            localStorage.setItem('useCrossfade', isOn ? 'on' : 'off');
            
            showNotification(
                isOn ? "Aktif" : "Kapalı", 
                "info", 
                isOn ? "Şarkılar yumuşak bir geçişle başlayacak." : "Şarkılar normal başlayacak."
            );
        };
    }
});
}
function loadProfile() {
    const u = localStorage.getItem('userName'); const a = localStorage.getItem('userAvatar');
    if(u) document.getElementById('greeting-text').innerText = u;
    if(a) document.querySelector('.user-greeting .avatar').innerHTML = `<img src="${a}" style="width:100%;height:100%;border-radius:50%">`;
}
function formatTime(t) { if(isNaN(t)) return "0:00"; let m=Math.floor(t/60), s=Math.floor(t%60); return `${m}:${s<10?'0':''}${s}`; }
/* =========================================
   GÜNCELLENMİŞ KAPAK RESMİ YÜKLEYİCİ
   ========================================= */
function setCoverImageFromDB(pid, el) {
    db.transaction(["playlist_covers"], "readonly").objectStore("playlist_covers").get(pid).onsuccess = e => {
        if (e.target.result) {
            // RESİM VARSA: Kaynağı ata ve görünür yap
            el.src = URL.createObjectURL(e.target.result);
            el.style.display = 'block';
        } else {
            // RESİM YOKSA: Gizli kalsın (Arkadaki gradient görünsün)
            el.style.display = 'none';
        }
    };
}
function updateAmbientBackground(url) {
    const bg = document.getElementById('ambient-background');
    if(bg) bg.style.background = `radial-gradient(circle at center, rgba(30,30,30,0.8), #000), url(${url}) no-repeat center/cover`;
}
function setupKeyboardControls() {
    document.addEventListener('keydown', (e) => {
        if(e.target.tagName === 'INPUT') return;
        if(e.code === 'Space') { e.preventDefault(); togglePlayPause(); }
        if(e.code === 'ArrowRight') playNext();
        if(e.code === 'ArrowLeft') playPrev();
    });
}

/* =========================================
   LİSTEYE EKLEME MENÜSÜ (MODERN SELECTOR) ➕
   ========================================= */
function addSongToPlaylistModal(song) {
    if(!myPlaylists.length) {
        return showNotification("Liste Yok", "warning", "Önce bir çalma listesi oluşturmalısın.");
    }

    // Modal HTML'i hazırla
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay temp-ui';
    
    let listHTML = '';
    myPlaylists.forEach(pl => {
        // Şarkı zaten listede var mı?
        const exists = pl.songs.includes(song.id);
        const icon = exists ? '<i class="fa-solid fa-check" style="color:#2ecc71;"></i>' : '<i class="fa-regular fa-square"></i>';
        const style = exists ? 'opacity:0.5; pointer-events:none;' : ''; // Varsa tıklanmasın
        
        listHTML += `
            <div class="playlist-select-item" onclick="confirmAddToPlaylist(${pl.id}, '${song.id}')" 
                 style="padding:15px; background:rgba(255,255,255,0.05); margin-bottom:10px; border-radius:8px; cursor:pointer; display:flex; align-items:center; gap:15px; transition:0.2s; ${style}">
                ${icon}
                <span style="font-weight:500;">${pl.name}</span>
                <span style="margin-left:auto; font-size:0.8rem; color:#aaa;">${pl.songs.length} şarkı</span>
            </div>
        `;
    });

    overlay.innerHTML = `
        <div class="modal-content" style="width:350px;">
            <h3 style="margin-bottom:10px; text-align:center;">Listeye Ekle</h3>
            <p style="color:#aaa; text-align:center; margin-bottom:20px; font-size:0.9rem;">${song.name}</p>
            
            <div style="max-height:300px; overflow-y:auto;">
                ${listHTML}
            </div>

            <button class="modal-btn cancel" style="width:100%; margin-top:15px;">Kapat</button>
        </div>
    `;

    document.body.appendChild(overlay);
    setTimeout(() => overlay.style.display = 'flex', 10);

    // Kapatma butonu
    overlay.querySelector('.cancel').onclick = () => overlay.remove();
    
    // Global erişim için geçici fonksiyon (Tıklanınca çalışır)
    window.confirmAddToPlaylist = (plId, songId) => {
        const pl = myPlaylists.find(p => p.id == plId);
        if(pl && !pl.songs.includes(songId)) {
            // Şarkıyı ekle
            pl.songs.push(parseInt(songId) || songId); // ID tipi garanti olsun
            localStorage.setItem('myPlaylists', JSON.stringify(myPlaylists));
            
            // Bildirim ver ve kapat
            showNotification("Eklendi", "success", `Şarkı "${pl.name}" listesine eklendi.`);
            overlay.remove();
            
            // Eğer sidebar açıksa güncelle (sayı değişti)
            if(typeof renderSidebar === 'function') renderSidebar();
        }
    };
}

// Modal & Diğer
const settingsModal = document.getElementById('settings-modal');
document.getElementById('settings-btn').onclick = () => { settingsModal.classList.remove('hidden'); updateEqSlidersUI(); };
document.getElementById('close-settings-btn').onclick = () => settingsModal.classList.add('hidden');
if(fileInput) fileInput.onchange = e => handleFile(e.target.files[0]);

window.openShortcutsModal = () => document.getElementById('shortcuts-modal').classList.remove('hidden');
window.closeShortcutsModal = (e) => { if(e.target.id==='shortcuts-modal' || e.target.classList.contains('cancel')) document.getElementById('shortcuts-modal').classList.add('hidden'); };

window.changeTheme = (c) => { document.documentElement.style.setProperty('--primary-color', c); localStorage.setItem('themeColor', c); }
window.resetApp = async () => { 
    const onay = await showConfirm("Sıfırlama", "Tüm verilerin silinecek. Emin misin?");
    if(onay) { 
        indexedDB.deleteDatabase(dbName); 
        localStorage.clear(); 
        location.reload(); 
    } 
};
// Edit Modal İşlemleri
// Edit Modal İşlemleri (Resim Güncelleme Düzeltildi)
/* =========================================
   LİSTE DÜZENLEME MODALI (TAMİR EDİLDİ) 🛠️
   ========================================= */
function openEditModal(name) {
    const pl = myPlaylists.find(p => p.name === name);
    if(!pl) return;

    // 1. HTML Elementlerini Seç (Senin HTML yapına birebir uygun)
    const modal = document.getElementById('edit-modal');
    const nameInput = document.getElementById('edit-name-input');
    const fileInput = document.getElementById('edit-file-input'); // HTML'deki ID bu
    const imgPreview = document.getElementById('edit-img-preview');
    const imgBox = document.getElementById('edit-img-box');
    const saveBtn = document.getElementById('save-edit-btn');

    // 2. Mevcut Değerleri Yerleştir
    nameInput.value = pl.name;
    fileInput.value = ''; // Inputu temizle

    // Mevcut resmi veritabanından getir (Önizleme için)
    imgPreview.src = "https://via.placeholder.com/150/000000/FFFFFF/?text=♪"; // Varsayılan
    const tx = db.transaction(["playlist_covers"], "readonly");
    tx.objectStore("playlist_covers").get(pl.id).onsuccess = e => {
        if (e.target.result) imgPreview.src = URL.createObjectURL(e.target.result);
    };

    // 3. Modalı Göster
    modal.classList.remove('hidden');

    // --- OLAY DİNLEYİCİLERİ (EVENTS) ---

    // A. Resim Kutusuna Tıklayınca -> Gizli Input'a Tıkla
    imgBox.onclick = () => {
        fileInput.click();
    };

    // B. Dosya Seçilince -> Önizlemeyi Güncelle
    fileInput.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
            imgPreview.src = URL.createObjectURL(file);
        }
    };

    // C. Kaydet Butonu (Önceki eventleri temizlemek için onlick = ... kullanıyoruz)
    saveBtn.onclick = () => {
        const newName = nameInput.value.trim();
        const file = fileInput.files[0]; // Yeni seçilen dosya

        if(newName) {
            const oldName = pl.name;
            
            // 1. İsmi Güncelle
            pl.name = newName;
            localStorage.setItem('myPlaylists', JSON.stringify(myPlaylists));

            // 2. Resim Varsa Kaydet, Yoksa Çıkış Yap
            if (file) {
                const txWrite = db.transaction(["playlist_covers"], "readwrite");
                const store = txWrite.objectStore("playlist_covers");
                
                const req = store.put(file, pl.id); // ID ile kaydet
                
                req.onsuccess = () => finalizeEdit(oldName, newName);
                req.onerror = () => {
                    alert("Resim kaydedilemedi, ama isim değişti.");
                    finalizeEdit(oldName, newName);
                };
            } else {
                // Resim değişmediyse sadece ismi kaydet ve çık
                finalizeEdit(oldName, newName);
            }
        } else {
            alert("Liste adı boş olamaz!");
        }
    };

    // D. Temizlik ve Yenileme Fonksiyonu
    function finalizeEdit(oldName, newName) {
        modal.classList.add('hidden');
        
        // Kenar çubuğunu ve ana sayfayı yenile
        renderSidebar();
        renderHomeView();

        // Eğer şu an o listenin içindeysek, başlığı ve kapağı güncelle
        const activeHeader = document.querySelector('.playlist-view-header h1');
        if(activeHeader && activeHeader.innerText === oldName) {
             const listSongs = allSongs.filter(s => pl.songs.includes(s.id));
             renderPlaylistView(newName, listSongs, 'userPlaylist');
        }
        
        // Hafif bir bildirim
        // alert("Liste güncellendi! ✅"); // İstersen bunu açabilirsin
    }
}

document.getElementById('cancel-edit-btn').onclick = () => document.getElementById('edit-modal').classList.add('hidden');

async function deletePlaylist(name) {
    const onay = await showConfirm("Listeyi Sil", `"${name}" listesini silmek istiyor musun?`);
    if(onay) {
        myPlaylists = myPlaylists.filter(p => p.name !== name);
        localStorage.setItem('myPlaylists', JSON.stringify(myPlaylists));
        renderSidebar(); 
        renderHomeView();
        showNotification("Silindi", "info", "Çalma listesi kaldırıldı.");
    }
}
function removeSongFromPlaylist(pName, sId) {
    const idx = myPlaylists.findIndex(p=>p.name===pName);
    if(idx>-1) {
        myPlaylists[idx].songs = myPlaylists[idx].songs.filter(id=>id!==sId);
        localStorage.setItem('myPlaylists', JSON.stringify(myPlaylists));
        const updatedSongs = allSongs.filter(s => myPlaylists[idx].songs.includes(s.id));
        renderPlaylistView(pName, updatedSongs, 'userPlaylist');
    }
}

/* =========================================
   CANLI LİSTE GÜNCELLEME (SPOT IŞIĞI) 🔦
   ========================================= */
function updateActiveSongHighlight(songId) {
    // 1. Önce parlayan eski satırı bul ve söndür
    const activeRow = document.querySelector('.song-row.active-song');
    if (activeRow) {
        activeRow.classList.remove('active-song');
    }

    // 2. Yeni çalan şarkının satırını bul (data-id sayesinde!)
    // CSS Seçicisi: [data-id="123"] olan elemanı getir
    const newRow = document.querySelector(`.song-row[data-id="${songId}"]`);
    
    // 3. Eğer bu şarkı şu an ekrandaki listede varsa, yak ışıkları!
    if (newRow) {
        newRow.classList.add('active-song');
        
        // Bonus: Eğer liste çok uzunsa ve şarkı aşağıdaysa, oraya kaydır
        // newRow.scrollIntoView({ behavior: 'smooth', block: 'center' }); 
    }
}
//Penci Zorno
/* =========================================
   EQ AÇMA/KAPAMA MANTIĞI (MASTER SWITCH)
   ========================================= */

// 1. EQ Değerlerini Uygulayan Merkezi Fonksiyon
function applyEqSettings() {
    // Önce "EQ Açık mı?" diye bak
    const isEnabled = localStorage.getItem('eqEnabled') !== 'off'; // Varsayılan: Açık
    
    // Değerleri LocalStorage'dan veya Slider'dan al
    const bbVal = parseFloat(document.getElementById('bass-boost').value);
    const lowVal = parseFloat(document.getElementById('eq-low').value);
    const midVal = parseFloat(document.getElementById('eq-mid').value);
    const highVal = parseFloat(document.getElementById('eq-high').value);

    // Eğer EQ Açıksa değerleri uygula, Kapalıysa HEPSİNİ SIFIRLA (Bypass)
    if(bassBoostNode) bassBoostNode.gain.value = isEnabled ? bbVal : 0;
    if(eqLowNode) eqLowNode.gain.value = isEnabled ? lowVal : 0;
    if(eqMidNode) eqMidNode.gain.value = isEnabled ? midVal : 0;
    if(eqHighNode) eqHighNode.gain.value = isEnabled ? highVal : 0;

    // Görsel olarak alanı pasif/aktif yap
    const area = document.getElementById('eq-controls-area');
    if(area) {
        if(isEnabled) area.classList.remove('disabled-area');
        else area.classList.add('disabled-area');
    }
}

// 2. Slider Eventlerini Güncelle (Değişince bu fonksiyonu çağırsınlar)
const eqControls = ['bass-boost','eq-low','eq-mid','eq-high'];
eqControls.forEach(id => {
    const el = document.getElementById(id);
    if(el) el.oninput = (e) => {
        // Değeri kaydet
        localStorage.setItem(id.replace('-','_'), e.target.value);
        // Uygula (Eğer açıksa uygulanır)
        applyEqSettings();
    };
});

// 3. Toggle (Anahtar) Mantığı - Bunu loadSettings içine de ekleyebilirsin ama burası daha temiz
const eqToggle = document.getElementById('eq-toggle');
if(eqToggle) {
    // Başlangıç durumu
    const state = localStorage.getItem('eqEnabled') !== 'off';
    eqToggle.checked = state;
    applyEqSettings(); // İlk yüklemede uygula

    // Değişince
    eqToggle.onchange = (e) => {
        const isOn = e.target.checked;
        localStorage.setItem('eqEnabled', isOn ? 'on' : 'off');
        applyEqSettings();
    };
}

/* =========================================
   EQ MASTER SWITCH (AÇMA/KAPAMA) VE AYARLAR
   ========================================= */

// 1. Ayarları Uygulayan Ana Fonksiyon
function applyEqSettings() {
    // Tuş var mı ve açık mı kontrol et
    const toggle = document.getElementById('eq-toggle');
    const isEnabled = toggle ? toggle.checked : true; // Tuş yoksa varsayılan açık olsun

    // Slider değerlerini al
    const bbVal = parseFloat(document.getElementById('bass-boost').value);
    const lowVal = parseFloat(document.getElementById('eq-low').value);
    const midVal = parseFloat(document.getElementById('eq-mid').value);
    const highVal = parseFloat(document.getElementById('eq-high').value);

    // Eğer düğüm (node) oluşturulmuşsa uygula
    // Mantık: Açıksa değeri gönder, Kapalıysa 0 gönder.
    if(bassBoostNode) bassBoostNode.gain.value = isEnabled ? bbVal : 0;
    if(eqLowNode) eqLowNode.gain.value = isEnabled ? lowVal : 0;
    if(eqMidNode) eqMidNode.gain.value = isEnabled ? midVal : 0;
    if(eqHighNode) eqHighNode.gain.value = isEnabled ? highVal : 0;

    // Görsel olarak alanı grileştir (Disabled efekti)
    const area = document.getElementById('eq-controls-area');
    if(area) {
        if(isEnabled) area.classList.remove('disabled-area');
        else area.classList.add('disabled-area');
    }

    // Durumu kaydet
    if(toggle) localStorage.setItem('eqEnabled', isEnabled ? 'on' : 'off');
}

// 2. Slider'ları Dinle (Oynatınca Ayarı Uygula)
['bass-boost', 'eq-low', 'eq-mid', 'eq-high'].forEach(id => {
    const el = document.getElementById(id);
    if(el) {
        el.oninput = (e) => {
            // Değeri hafızaya at
            localStorage.setItem(id.replace('-', '_'), e.target.value);
            // Fonksiyonu çağır
            applyEqSettings();
        };
    }
});

// 3. Açma/Kapama Tuşunu Dinle
const eqToggleBtn = document.getElementById('eq-toggle');
if(eqToggleBtn) {
    // Sayfa açılışında kayıtlı durumu geri yükle
    const savedState = localStorage.getItem('eqEnabled') !== 'off'; 
    eqToggleBtn.checked = savedState;

    // Tıklanınca fonksiyonu çalıştır
    eqToggleBtn.onchange = applyEqSettings;
    
    // Sayfa ilk yüklendiğinde bir kere çalıştır ki grileşmesi gerekiyorsa grileşsin
    // (Ses motoru hazır olmasa bile görseli ayarlar)
    setTimeout(applyEqSettings, 100); 
}


/* =========================================
   A. ARŞİV ARAMASI (CORSPROXY.IO - SON ÇARE) 🚀
   ========================================= */
async function searchArchiveMusic(term) {
    const area = document.getElementById('archive-search-results');
    if(!area) return;

    area.innerHTML = '<p style="color:#aaa;"><i class="fa-solid fa-spinner fa-spin"></i> Arşiv taranıyor...</p>';

    try {
        // 1. SORGUYU HAZIRLA
        const params = new URLSearchParams({
            q: `(${term}) AND mediatype:(audio)`,
            fl: ['identifier', 'title', 'creator', 'collection', 'downloads'],
            sort: 'downloads desc',
            rows: '20',
            page: '1',
            output: 'json'
        });

        // 2. SAĞLAM KÖPRÜ (corsproxy.io)
        // Bu servis çok daha hızlı ve güvenilirdir.
        const targetUrl = `https://archive.org/advancedsearch.php?${params.toString()}`;
        
        // DİKKAT: corsproxy.io adresinin sonuna direkt hedef linki ekliyoruz.
        const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`;

        console.log("🚀 İstek:", proxyUrl);

        const res = await fetch(proxyUrl);
        
        // Eğer sunucudan cevap gelmezse
        if(!res.ok) throw new Error(`Sunucu Hatası: ${res.status}`);
        
        // Hata kontrolü: Gelen şey JSON mu? (HTML hatası gelirse yakalamak için)
        const contentType = res.headers.get("content-type");
        if (!contentType || !contentType.includes("json")) {
            const text = await res.text(); // Hatayı görmek için
            console.error("Gelen veri JSON değil:", text.substring(0, 100)); // Konsola ilk 100 karakteri bas
            throw new Error("Arşiv sitesi şu an yoğun (HTML döndü). Lütfen tekrar dene.");
        }

        const data = await res.json();
        const docs = data.response.docs;
        
        area.innerHTML = '';

        // 3. FİLTRELEME
        const bannedCollections = ['podcasts', 'audio_book', 'librivox', 'radio', 'etree'];
        let validCount = 0;

        for (const doc of docs) {
            let isJunk = false;
            if (doc.collection) {
                const cols = Array.isArray(doc.collection) ? doc.collection : [doc.collection];
                if (cols.some(c => bannedCollections.includes(c))) isJunk = true;
            }
            if (!doc.title || doc.title.length > 100) isJunk = true;
            if (isJunk) continue;
            if (validCount >= 6) break;
            validCount++;

            let safeTitle = doc.title || "Bilinmeyen";
            if(safeTitle.length > 40) safeTitle = safeTitle.substring(0, 37) + "...";

            const songObj = {
                name: safeTitle,
                artist: doc.creator || "Archive.org",
                cover: `https://archive.org/services/img/${doc.identifier}`, 
                identifier: doc.identifier
            };

            const card = document.createElement('div');
            card.className = 'song-card web-card';
            card.style.border = "1px solid #7f8c8d";
            card.innerHTML = `
                <div class="card-img-wrapper">
                    <img src="${songObj.cover}" onerror="this.src='https://via.placeholder.com/300?text=Audio'">
                    <div class="card-play-btn"><i class="fa-solid fa-play"></i></div>
                </div>
                <div class="card-title" title="${doc.title}">${songObj.name}</div>
                <div class="card-artist">${songObj.artist}</div>
                <button class="dl-btn" style="width:100%;margin-top:5px;background:#7f8c8d;border:none;color:#fff;padding:5px;border-radius:3px;cursor:pointer;">İndir</button>
            `;

            // Oynat
            card.querySelector('.card-img-wrapper').onclick = async () => {
                document.getElementById('bar-title').innerText = "Bağlanıyor...";
                const mp3 = await findMp3InArchive(doc.identifier);
                if(mp3) { 
                    audio.src = mp3; 
                    if(typeof isChillMode !== 'undefined' && isChillMode) {
                        audio.playbackRate = 0.85; 
                        if(audio.preservesPitch !== undefined) audio.preservesPitch = false;
                    } else { audio.playbackRate = 1.0; }
                    audio.play().catch(e => console.error(e));
                    
                    document.getElementById('bar-title').innerText = songObj.name;
                    document.getElementById('bar-artist').innerText = songObj.artist;
                    const barCover = document.getElementById('bar-cover');
                    if(barCover) { barCover.src = songObj.cover; barCover.style.display = 'block'; }
                    
                    playerBar.classList.add('playing');
                    document.getElementById('play-btn').innerHTML = '<i class="fa-solid fa-pause"></i>';
                } else {
                    alert("MP3 bulunamadı.");
                }
            };

            // İndir
            const btn = card.querySelector('.dl-btn');
            btn.onclick = async (e) => {
                e.stopPropagation(); btn.innerText = "Aranıyor...";
                const mp3 = await findMp3InArchive(doc.identifier);
                if(mp3) {
                    btn.innerText = "İniyor...";
                    await downloadSongToLibrary({...songObj, previewUrl: mp3}, btn);
                } else { btn.innerText = "Yok"; btn.style.background = "#c0392b"; }
            };
            area.appendChild(card);
        }
        if (validCount === 0) area.innerHTML = '<p style="color:#666;">Sonuç yok.</p>';

    } catch(e) { 
        console.error("PROXY HATASI:", e);
        area.innerHTML = `<p style="color:#e74c3c;">Hata: ${e.message} Archive.org çökmüş olabilir</p>`; 
    }
}

// YARDIMCI: MP3 Bulucu (Bu da corsproxy.io kullanmalı!)
async function findMp3InArchive(id) {
    try {
        const targetUrl = `https://archive.org/metadata/${id}`;
        // Burayı da güncelledik:
        const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`;
        
        const r = await fetch(proxyUrl);
        const d = await r.json();
        
        let f = d.files.find(x => x.format === 'VBR MP3');
        if (!f) f = d.files.find(x => x.format === 'MP3');
        if (!f) f = d.files.find(x => x.name.endsWith('.mp3'));

        return f ? `https://archive.org/download/${id}/${f.name}` : null;
    } catch(e) { 
        console.error("PROXY HATASI:", e);
        // Hata mesajını özelleştirdik
        area.innerHTML = `
            <div style="text-align:center; padding:20px; color:#aaa;">
                <i class="fa-solid fa-server" style="font-size:2rem; margin-bottom:10px; color:#e74c3c;"></i>
                <p>Arşiv sunucuları şu an yanıt vermiyor.</p>
                <small style="color:#666;">(Archive.org şu an yoğun veya bakımda olabilir. Birazdan tekrar dene.)</small>
            </div>
        `; 
    }
}

/* =========================================
   B. ITUNES ARAMASI - DEMOLAR (30sn)
   ========================================= */
async function searchItunesMusic(term) {
    const area = document.getElementById('itunes-search-results');
    if(!area) return;

    try {
        const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(term)}&media=music&limit=6`);
        const data = await res.json();

        if (data.resultCount === 0) { area.innerHTML = '<p style="color:#666;">Sonuç yok.</p>'; return; }
        area.innerHTML = '';

        data.results.forEach(item => {
            const bigCover = item.artworkUrl100.replace('100x100','300x300');
            const card = document.createElement('div');
            card.className = 'song-card web-card';
            card.style.border = "1px dashed #e74c3c"; // Kırmızı kesik çizgi

            card.innerHTML = `
                <div class="card-img-wrapper">
                    <img src="${bigCover}">
                    <div class="card-play-btn"><i class="fa-solid fa-play"></i></div>
                    <div style="position:absolute;top:5px;right:5px;background:#e74c3c;color:#fff;font-size:0.6rem;padding:2px 4px;border-radius:3px;">DEMO</div>
                </div>
                <div class="card-title">${item.trackName}</div>
                <div class="card-artist">${item.artistName}</div>
                <button class="dl-btn" style="width:100%;margin-top:5px;background:#e74c3c;border:none;color:#fff;padding:5px;border-radius:3px;cursor:pointer;">Ekle (Demo)</button>
            `;

            // Oynat
            card.querySelector('.card-img-wrapper').onclick = () => {
                audio.src=item.previewUrl; audio.play();
                document.getElementById('bar-title').innerText=item.trackName + " (Demo)";
                document.getElementById('bar-artist').innerText=item.artistName;
                document.getElementById('bar-cover').src=bigCover;
                playerBar.classList.add('playing');
                document.getElementById('play-btn').innerHTML='<i class="fa-solid fa-pause"></i>';
            };

            // İndir
            const btn = card.querySelector('.dl-btn');
            btn.onclick = async (e) => {
                e.stopPropagation(); btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
                // iTunes verisini bizim formata uydurup indiriciye yolluyoruz
                const songData = {
                    name: item.trackName + " (Demo)",
                    artist: item.artistName,
                    cover: bigCover,
                    previewUrl: item.previewUrl
                };
                await downloadSongToLibrary(songData, btn);
            };
            area.appendChild(card);
        });

    } catch(e) { area.innerHTML = '<p>Hata.</p>'; }
}
// YARDIMCI: Bir arşiv kaydının içindeki dosyalardan MP3 olanını bulur
async function findMp3InArchive(identifier) {
    try {
        const metaRes = await fetch(`https://archive.org/metadata/${identifier}`);
        const metaData = await metaRes.json();
        
        // Dosyalar arasında gez, formatı 'VBR MP3' veya 'MP3' olan ilk dosyayı bul
        const mp3File = metaData.files.find(f => f.format === 'VBR MP3' || f.format === 'MP3');
        
        if (mp3File) {
            return `https://archive.org/download/${identifier}/${mp3File.name}`;
        }
        return null;
    } catch (e) {
        return null;
    }
}

/* =========================================
   İNDİRME VE KAYDETME (AYNI KALIYOR AMA URL HAZIR GELİYOR)
   ========================================= */
async function downloadSongToLibrary(webSong, btnElement) {
    try {
        // Archive.org CORS konusunda genelde rahattır ama bazen redirect eder
        const response = await fetch(webSong.previewUrl);
        if (!response.ok) throw new Error("İndirme başarısız");
        
        const blob = await response.blob();

        const newSong = {
            name: webSong.name,
            artist: webSong.artist,
            cover: webSong.cover,
            blob: blob,
            category: 'userUploads',
            dateAdded: Date.now(),
            mood: 'chill'
        };

        saveSongToDB(newSong);
        
        if(btnElement) {
            btnElement.innerHTML = '<i class="fa-solid fa-check"></i> İndi!';
            btnElement.style.background = "#34495e";
            btnElement.disabled = true;
        }

    } catch (err) {
        console.error("İndirme hatası:", err);
        alert("İndirme sırasında hata oluştu.");
        if(btnElement) btnElement.innerHTML = 'Hata';
    }
}


/* =========================================
   INSTA-STORY KARTI OLUŞTURUCU 📸
   ========================================= */
function createInstaStory() {
    // 1. O an çalan şarkı var mı?
    if(!audio.src || currentPlaylist.length === 0) return alert("Önce bir şarkı çalmalısın!");
    
    const song = currentPlaylist[currentIndex];
    
    // 2. Geçici bir Canvas (Tuval) oluştur
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    // Instagram Story Boyutu (1080x1920)
    canvas.width = 1080;
    canvas.height = 1920;

    // 3. Görselleri Yükle
    const coverImg = new Image();
    coverImg.crossOrigin = "anonymous"; // CORS hatası yememek için
    coverImg.src = song.cover;

    coverImg.onload = () => {
        // A. ARKA PLAN (Bulanık Kapak)
        // Kapağı tüm ekrana yay
        ctx.drawImage(coverImg, 0, 0, canvas.width, canvas.height);
        
        // Buzlu Cam Efekti (Blur)
        ctx.fillStyle = "rgba(0, 0, 0, 0.7)"; // Siyah perde
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // B. ORTADAKİ KAPAK (Net)
        const coverSize = 800;
        const coverX = (canvas.width - coverSize) / 2;
        const coverY = (canvas.height - coverSize) / 2 - 200; // Biraz yukarıda
        
        // Kapağa gölge verelim
        ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
        ctx.shadowBlur = 50;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 20;

        ctx.drawImage(coverImg, coverX, coverY, coverSize, coverSize);
        
        // Gölgeyi kapat (yazılar bozulmasın)
        ctx.shadowBlur = 0;

        // C. YAZILAR
        ctx.textAlign = "center";
        ctx.fillStyle = "#ffffff";
        
        // Şarkı Adı
        ctx.font = "bold 70px 'Segoe UI', sans-serif";
        ctx.fillText(song.name, canvas.width / 2, coverY + coverSize + 120);
        
        // Sanatçı
        ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
        ctx.font = "50px 'Segoe UI', sans-serif";
        ctx.fillText(song.artist, canvas.width / 2, coverY + coverSize + 200);

        // D. LOGO / BRANDING
        ctx.fillStyle = "var(--primary-color)"; // Bu çalışmaz, hex lazım.
        ctx.fillStyle = "#5c20f7"; 
        ctx.font = "bold 40px 'Segoe UI', sans-serif";
        ctx.fillText("MOOD PLAYER", canvas.width / 2, canvas.height - 150);
        
        // E. İNDİRME İŞLEMİ
        const link = document.createElement('a');
        link.download = `MoodPlayer_${song.name}.png`;
        link.href = canvas.toDataURL("image/png");
        link.click();
        
        alert("Hikaye kartı indirildi! 📸");
    };

    coverImg.onerror = () => {
        alert("Kapak resmi yüklenirken hata oluştu (CORS koruması olabilir).");
    };
}

/* =========================================
   KARAOKE MODU (VOKAL BASTIRICI) 🎤
   ========================================= */
let isKaraokeActive = false;
let karaokeSplitter, karaokeInverter, karaokeMerger;

function toggleKaraoke() {
    // Ses motoru hazır mı?
    if(!isAudioSetup || !source) return alert("Önce bir şarkı çalmalısın!");

    const btn = document.getElementById('karaoke-btn');
    const txt = document.getElementById('karaoke-text');

    if(!isKaraokeActive) {
        // --- KARAOKE AÇILIYOR ---
        
        // 1. Gerekli parçaları oluştur (Daha önce oluşturmadıysak)
        if(!karaokeSplitter) {
            karaokeSplitter = audioContext.createChannelSplitter(2); // Sesi L ve R diye ayırır
            karaokeMerger = audioContext.createChannelMerger(2);   // Tekrar birleştirir
            
            karaokeInverter = audioContext.createGain();           // Sesi ters çevirmek için Gain düğümü
            karaokeInverter.gain.value = -1;                       // -1 ile çarpmak fazı ters çevirir
        }

        // 2. Kabloları Sök (Source -> BassBoost bağlantısını kopar)
        source.disconnect();

        // 3. Yeni Bağlantı Şeması (Faz Tersleme)
        // Kaynak -> Ayırıcı
        source.connect(karaokeSplitter);

        // Sol Kanal -> Olduğu gibi Birleştiriciye
        karaokeSplitter.connect(karaokeMerger, 0, 0);

        // Sağ Kanal -> Ters Çevirici -> Birleştiriciye (Vokali yok eder)
        karaokeSplitter.connect(karaokeInverter, 1);
        karaokeInverter.connect(karaokeMerger, 0, 0);

        // Birleştirici -> BassBoost (Normal zincire geri dön)
        karaokeMerger.connect(bassBoostNode);

        // Görsel Güncelleme
        isKaraokeActive = true;
        btn.style.background = "#f1c40f";
        btn.querySelector('i').style.color = "#000";
        btn.querySelector('h3').style.color = "#000";
        txt.innerText = "Açık";

        console.log("🎤 Karaoke Modu: Aktif (Vokaller bastırıldı)");

    } else {
        // --- KARAOKE KAPANIYOR ---
        
        // 1. Karaoke düğümlerini sök
        source.disconnect();
        karaokeSplitter.disconnect();
        karaokeInverter.disconnect();
        karaokeMerger.disconnect();

        // 2. Eski bağlantıyı kur (Source -> BassBoost)
        source.connect(bassBoostNode);

        // Görsel Güncelleme
        isKaraokeActive = false;
        btn.style.background = "rgba(255, 255, 255, 0.05)";
        btn.querySelector('i').style.color = "#f1c40f";
        btn.querySelector('h3').style.color = "#fff";
        txt.innerText = "Karaoke";
        
        console.log("🎤 Karaoke Modu: Kapalı");
    }
}

/* =========================================
   SAĞ TIK MENÜSÜ: ŞARKI KAPAĞI DEĞİŞTİRME 🖼️
   ========================================= */
const ctxCoverBtn = document.getElementById('ctx-cover');
const ctxCoverInput = document.getElementById('ctx-cover-input');

if (ctxCoverBtn && ctxCoverInput) {
    // 1. Menüdeki "Kapağı Değiştir"e basınca...
    ctxCoverBtn.onclick = () => {
        document.getElementById('context-menu').classList.add('hidden'); // Menüyü kapat
        ctxCoverInput.click(); // Gizli dosya seçiciyi tetikle
    };

    // 2. Kullanıcı bir resim seçince...
    ctxCoverInput.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Dosyayı Resim Verisine (Base64) Çevir
        const reader = new FileReader();
        
        reader.onload = function(event) {
            const newCoverData = event.target.result; // İşte yeni kapak resmi bu!
            
            // Hangi şarkıya sağ tıkladıysak onu bulalım (Global değişken: contextMenuTargetId)
            const targetSong = allSongs.find(s => s.id === contextMenuTargetId);
            
            if (targetSong) {
                // --- Veritabanı İşlemi (IndexedDB) ---
                const tx = db.transaction([storeName], "readwrite");
                const store = tx.objectStore(storeName);
                
                // Şarkıyı veritabanından çek
                store.get(targetSong.id).onsuccess = (ev) => {
                    const data = ev.target.result;
                    data.cover = newCoverData; // Veritabanındaki kapağı değiştir
                    
                    // Güncellenmiş halini geri kaydet
                    store.put(data).onsuccess = () => {
                        // 1. RAM'deki (Hafızadaki) listemizi güncelle
                        targetSong.cover = newCoverData;
                        
                        // 2. Arayüzü Güncelle
                        // Eğer şu an çalan şarkıysa, alt bardaki resmi değiştir
                        const currentPlaying = currentPlaylist[currentIndex];
                        if(currentPlaying && currentPlaying.id === targetSong.id) {
                            document.getElementById('bar-cover').src = newCoverData;
                            // Çalan şarkı listesindekini de güncelle
                            currentPlaying.cover = newCoverData;
                        }

                        // Sayfayı komple yenilemek yerine sadece ilgili resmi bulup değiştirelim (Daha hızlı)
                        const imgInList = document.querySelector(`.song-row[data-id="${targetSong.id}"] img`);
                        if(imgInList) imgInList.src = newCoverData;
                        
                        // Eğer "Eklediklerim" sayfasındaysak orayı tazeleyelim
                        const activeMenu = document.querySelector('.menu-item.active');
                        if(activeMenu && activeMenu.id === 'uploads-link') {
                             document.getElementById('uploads-link').click();
                        }

                        alert("Kapak resmi değişti! 🎨");
                    };
                };
            }
        };
        
        // Dosyayı okumayı başlat
        reader.readAsDataURL(file);
        
        // Input'u temizle (Aynı resmi tekrar seçebilmek için)
        ctxCoverInput.value = '';
    };
}

/* =========================================
   CHILL MOD (SLOWED VIBE) ❄️
   ========================================= */
let isChillMode = false;

function toggleChillMode() {
    const btn = document.getElementById('chill-btn');
    const txt = document.getElementById('chill-text');
    const icon = btn ? btn.querySelector('i') : null;

    if (!isChillMode) {
        // --- AÇILIYOR ---
        audio.playbackRate = 0.85; // Hızı %85'e düşür
        
        // Bu ayar çok önemli: 'false' yapınca ses kalınlaşır (Deep Voice)
        // 'true' kalsaydı sadece yavaş konuşan sincap gibi olurdu.
        if(audio.preservesPitch !== undefined) {
            audio.preservesPitch = false; 
        } else if(audio.mozPreservesPitch !== undefined) { // Firefox desteği
            audio.mozPreservesPitch = false;
        }

        isChillMode = true;
        
        // Görsel Efekt
        if(btn) {
            btn.style.background = "#00d2d3";
            if(icon) icon.style.color = "#000";
            if(txt) {
                txt.style.color = "#000";
                txt.innerText = "Aktif";
            }
        }
        console.log("❄️ Chill Mod: Aktif (0.85x Speed + Deep Pitch)");

    } else {
        // --- KAPANIYOR ---
        audio.playbackRate = 1.0; // Normal Hız
        if(audio.preservesPitch !== undefined) audio.preservesPitch = true;
        
        isChillMode = false;

        // Görsel Efekt
        if(btn) {
            btn.style.background = "rgba(255, 255, 255, 0.05)";
            if(icon) icon.style.color = "#00d2d3";
            if(txt) {
                txt.style.color = "#fff";
                txt.innerText = "Chill Mod";
            }
        }
        console.log("❄️ Chill Mod: Kapalı");
    }
}

/* =========================================
   MOODSCAPES MOTORU & TASARIMI (PRO SÜRÜM) 🌧️
   ========================================= */

// 1. Ses Dosyaları (CORS Ayarlı - Filtre İçin Şart)
const ambienceSounds = {
    rain: new Audio('https://actions.google.com/sounds/v1/weather/rain_heavy_loud.ogg'),
    fire: new Audio('https://actions.google.com/sounds/v1/ambiences/fire.ogg'),
    cafe: new Audio('https://actions.google.com/sounds/v1/ambiences/coffee_shop.ogg'),
    ocean: new Audio('https://actions.google.com/sounds/v1/water/waves_crashing.ogg')
};

// Sesleri döngüye al ve CORS izni ver
Object.values(ambienceSounds).forEach(s => { 
    s.loop = true; 
    s.volume = 0; 
    s.crossOrigin = "anonymous"; // Filtreleyebilmek için bu şart!
});

// 2. CSS Stillerini Enjekte Et
const ambienceStyle = document.createElement('style');
ambienceStyle.innerHTML = `
    .ambience-panel {
        position: fixed;
        bottom: 100px;
        right: 20px;
        width: 300px;
        background: rgba(20, 20, 20, 0.95);
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 15px;
        padding: 20px;
        z-index: 1000;
        backdrop-filter: blur(10px);
        box-shadow: 0 10px 30px rgba(0,0,0,0.5);
        transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.27), opacity 0.3s;
    }
    .ambience-panel.hidden {
        transform: translateY(20px) scale(0.9);
        opacity: 0;
        pointer-events: none;
    }
    .ambience-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
    .ambience-header h3 { margin: 0; font-size: 1.2rem; background: linear-gradient(to right, #9b59b6, #8e44ad); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    .close-widget-btn { background: none; border: none; color: #aaa; cursor: pointer; font-size: 1.2rem; }
    
    .sound-row { display: flex; align-items: center; margin-bottom: 15px; }
    .sound-icon { width: 40px; height: 40px; background: rgba(255,255,255,0.05); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-right: 15px; color: #9b59b6; transition: all 0.3s ease; }
    .sound-icon:hover { background: rgba(255,255,255,0.1); }
    /* Efekt açıkken ikon tarzı */
    .sound-icon.muffled { background: #3498db; color: white; box-shadow: 0 0 10px #3498db; }

    .sound-controls { flex: 1; display: flex; flex-direction: column; }
    .sound-controls span { font-size: 0.8rem; color: #ccc; margin-bottom: 5px; }
    
    .sound-controls input[type=range] { -webkit-appearance: none; width: 100%; height: 4px; background: rgba(255,255,255,0.1); border-radius: 2px; outline: none; }
    .sound-controls input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 12px; height: 12px; background: #9b59b6; border-radius: 50%; cursor: pointer; transition: 0.2s; }
    .sound-controls input[type=range]::-webkit-slider-thumb:hover { transform: scale(1.2); }
`;
document.head.appendChild(ambienceStyle);

// 3. Panel Aç/Kapa ve Ses Ayarı
function toggleAmbiencePanel() {
    const panel = document.getElementById('ambience-widget');
    panel.classList.toggle('hidden');
}

// 3. Panel Aç/Kapa ve Ses Ayarı (GÜNCELLENDİ: BUĞU EFEKTİ EKLENDİ)
function setAmbienceVol(type, val) {
    const audioObj = ambienceSounds[type];
    const volume = parseFloat(val);
    
    if(audioObj) {
        // Ses açma/kapama mantığı (Aynı)
        if(volume > 0 && audioObj.paused) audioObj.play().catch(e => console.log("Otomatik oynatma engellendi."));
        else if(volume === 0 && !audioObj.paused) { audioObj.pause(); audioObj.currentTime = 0; }
        audioObj.volume = volume;

        // --- YENİ: EĞER BU 'YAĞMUR' SESİ İSE ---
        if (type === 'rain') {
            // Yağmurun sesi 0'dan büyükse 'raining' sınıfını ekle, yoksa kaldır.
            if (volume > 0.01) { // 0.01 dedim ki çok az açılınca hemen devreye girmesin
                 document.body.classList.add('raining');
            } else {
                 document.body.classList.remove('raining');
            }
        }
        // ---------------------------------------
    }
}

// 4. YAĞMUR EFEKTİ (İÇERİSİ / DIŞARISI) 🌧️🏠
let rainContext, rainSource, rainFilter;
let isRainMuffled = false;

function toggleRainEffect(iconEl) {
    const rainAudio = ambienceSounds.rain;

    // A. Ses motorunu (AudioContext) sadece ilk kez tıklandığında kur (Performans için)
    if (!rainContext) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        rainContext = new AudioContext();
        
        // Sesi tarayıcıdan yakala
        rainSource = rainContext.createMediaElementSource(rainAudio);
        
        // Filtreyi oluştur (Lowpass = Boğuklaştırma)
        rainFilter = rainContext.createBiquadFilter();
        rainFilter.type = 'lowpass';
        rainFilter.frequency.value = 22000; // Başlangıçta filtre açık (Normal ses)

        // Bağlantıları yap: Kaynak -> Filtre -> Hoparlör
        rainSource.connect(rainFilter);
        rainFilter.connect(rainContext.destination);
    }

    // B. Durumu Değiştir
    isRainMuffled = !isRainMuffled;

    if (isRainMuffled) {
        // --- BOĞUK MOD (DIŞARIDAN GELİYOR GİBİ) ---
        // Frekansı 600Hz'e düşür (Sadece basları geçir)
        rainFilter.frequency.linearRampToValueAtTime(1100, rainContext.currentTime + 0.5);
        
        // Görsel: İkonu Mavi Yap
        iconEl.classList.add('muffled');
        iconEl.title = "Dışarıdan gelen ses (Tıkla: Normal)";
    } else {
        // --- NORMAL MOD ---
        // Frekansı aç (Tüm sesleri geçir)
        rainFilter.frequency.linearRampToValueAtTime(22000, rainContext.currentTime + 0.5);
        
        // Görsel: İkonu Normale Döndür
        iconEl.classList.remove('muffled');
        iconEl.title = "Normal ses (Tıkla: Dışarıdan)";
    }
}

/* =========================================
   UYKU ZAMANLAYICISI (BAR ENTEGRASYONLU) 🌙
   ========================================= */
let sleepTimerInterval;
let sleepTimeout;
let originalVolumeForSleep = 1;

// Menüyü Aç/Kapa
function toggleSleepMenu() {
    const menu = document.getElementById('sleep-menu-popup');
    if(menu) menu.classList.toggle('hidden');
}

// Menü dışına tıklanırsa kapat (Kullanım kolaylığı)
document.addEventListener('click', (e) => {
    const menu = document.getElementById('sleep-menu-popup');
    const btn = document.getElementById('sleep-timer-btn');
    if (menu && !menu.classList.contains('hidden')) {
        if (btn && !menu.contains(e.target) && !btn.contains(e.target)) {
            menu.classList.add('hidden');
        }
    }
});

function startSleepTimer(minutes) {
    cancelSleepTimer(false); // Varsa eskiyi temizle
    originalVolumeForSleep = audio.volume;

    const durationMs = minutes * 60 * 1000;
    const endTime = Date.now() + durationMs;
    
    // Arayüz Güncelleme
    const btn = document.getElementById('sleep-timer-btn');
    const badge = document.getElementById('sleep-badge');
    const menu = document.getElementById('sleep-menu-popup');
    
    if(btn) btn.classList.add('active'); // İkonu sarı yap
    if(badge) badge.classList.remove('hidden'); // Rozeti göster
    if(menu) menu.classList.add('hidden'); // Menüyü kapat

    // Geri Sayım Döngüsü (Sadece ekrandaki sayıyı güncellemek için)
    sleepTimerInterval = setInterval(() => {
        const remaining = endTime - Date.now();
        if (remaining <= 0) {
            clearInterval(sleepTimerInterval);
            if(badge) badge.innerText = "0";
        } else {
            const m = Math.floor(remaining / 60000) + 1; // Yukarı yuvarla ki 14:01 iken 15dk yazsın
            // Rozete sadece dakikayı yaz
            if(badge) badge.innerText = m + 'dk';
        }
    }, 1000);

    // Kapanış Emri (Süre dolunca çalışacak kod)
    sleepTimeout = setTimeout(triggerFadeOut, durationMs);
    
    alert(`Zamanlayıcı kuruldu: ${minutes} dakika sonra kapanacak. 🌙`);
}

function cancelSleepTimer(showMsg = true) {
    clearInterval(sleepTimerInterval);
    clearTimeout(sleepTimeout);
    
    // Arayüzü Sıfırla
    const btn = document.getElementById('sleep-timer-btn');
    const badge = document.getElementById('sleep-badge');
    
    if(btn) btn.classList.remove('active');
    if(badge) {
        badge.innerText = "";
        badge.classList.add('hidden');
    }
    
    const menu = document.getElementById('sleep-menu-popup');
    if(menu) menu.classList.add('hidden');
    
    if(showMsg) alert("Zamanlayıcı iptal edildi.");
}

// FADE OUT: Müziği ve Ambiyansı Yavaşça Kapat 📉
function triggerFadeOut() {
    const fadeDuration = 10000; // 10 Saniye sürsün
    const steps = 50;
    const stepTime = fadeDuration / steps;
    const volStep = audio.volume / steps;

    const fadeInterval = setInterval(() => {
        // Ana Müziği Kıs
        if (audio.volume > 0.05) {
            audio.volume = Math.max(0, audio.volume - volStep);
        } else {
            // -- KAPANIŞ ANI --
            clearInterval(fadeInterval);
            
            // 1. Müziği Durdur
            audio.pause();
            audio.volume = originalVolumeForSleep; // Sesi eski haline getir (Yarın için)
            
            // 2. Ambiyans Seslerini Durdur (Varsa)
            if(typeof ambienceSounds !== 'undefined') {
                Object.values(ambienceSounds).forEach(s => { 
                    s.pause(); 
                    s.currentTime = 0; 
                });
            }

            // 3. Yağmur Efekti Açıksa Kapat (Görseli sıfırla)
            document.body.classList.remove('raining');

            // 4. Arayüzü Temizle
            cancelSleepTimer(false);
            
            console.log("😴 Her şey uyku moduyla kapatıldı.");
        }
    }, stepTime);
}

/* =========================================
   KULLANICI PROFİLİ YÖNETİMİ (KALICI) 👤
   ========================================= */

// 1. Site açılınca profili yükle
document.addEventListener('DOMContentLoaded', () => {
    loadUserProfile();
});

function loadUserProfile() {
    // Hafızadan oku
    const savedName = localStorage.getItem('userName');
    const savedAvatar = localStorage.getItem('userAvatar');

    // A. İsim Varsa Yerleştir
    if (savedName) {
        // Yan menüdeki isim
        const sidebarName = document.querySelector('.user-info h3'); // Veya ID'si neyse
        if (sidebarName) sidebarName.innerText = savedName;

        // Ayarlardaki input
        const settingsInput = document.getElementById('settings-username-input');
        if (settingsInput) settingsInput.value = savedName;
    }

    // B. Resim Varsa Yerleştir
    if (savedAvatar) {
        // Yan menüdeki resim (ID'si user-avatar varsayıyoruz, yoksa class'tan buluruz)
        const sidebarImg = document.getElementById('user-avatar') || document.querySelector('.user-info img');
        if (sidebarImg) sidebarImg.src = savedAvatar;

        // Ayarlardaki önizleme
        const settingsImg = document.getElementById('settings-avatar-preview');
        if (settingsImg) settingsImg.src = savedAvatar;
    }
}

// 2. Ayarlarda resim seçince anlık göster (Henüz kaydetme yok)
function previewAvatar(input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function(e) {
            // Sadece ayarlar penceresindeki resmi değiştir (Önizleme)
            document.getElementById('settings-avatar-preview').src = e.target.result;
        }
        reader.readAsDataURL(input.files[0]);
    }
}

// 3. KAYDET Butonuna basınca her şeyi güncelle ve hafızaya at
function saveUserProfile() {
    const nameInput = document.getElementById('settings-username-input');
    const imgPreview = document.getElementById('settings-avatar-preview');
    
    // İsim Kaydı
    if (nameInput && nameInput.value.trim() !== "") {
        const newName = nameInput.value.trim();
        localStorage.setItem('userName', newName); // Hafızaya at
        
        // Yan menüyü güncelle
        const sidebarName = document.querySelector('.user-info h3');
        if(sidebarName) sidebarName.innerText = newName;
    }

    // Resim Kaydı (Base64 formatında src içinden alıyoruz)
    if (imgPreview) {
        const newAvatarSrc = imgPreview.src;
        // Eğer placeholder değilse kaydet
        if (!newAvatarSrc.includes('via.placeholder.com')) {
            localStorage.setItem('userAvatar', newAvatarSrc); // Hafızaya at
            
            // Yan menüyü güncelle
            const sidebarImg = document.getElementById('user-avatar') || document.querySelector('.user-info img');
            if(sidebarImg) sidebarImg.src = newAvatarSrc;
        }
    }

    showNotification("Profil Güncellendi", "success", "Bilgiler kaydedildi");
    closeSettingsModal(); // Varsa modal kapatma fonksiyonun
}

function closeSettingsModal() {
    const modal = document.getElementById('settings-modal');
    if(modal) {
        modal.classList.add('hidden'); // Sınıfı geri ekle
        modal.style.removeProperty('display'); // Varsa inline stili temizle (Garanti olsun)
    }
}

/* =========================================
   SEEK BAR GRADIENT GÜNCELLEYİCİ 🎨
   ========================================= */
function updateSeekGradient() {
    const seekBar = document.getElementById('seek-bar');
    if (!seekBar) return;

    // Yüzdeyi hesapla
    const min = seekBar.min || 0;
    const max = seekBar.max || 100;
    const val = seekBar.value;
    
    // Sıfıra bölünme hatasını önle
    if (max === 0) return;

    const percentage = ((val - min) / (max - min)) * 100;

    // Sol taraf Mor/Tema Rengi, Sağ taraf Şeffaf Gri
    seekBar.style.background = `linear-gradient(to right, #5c20f7 0%, var(--primary-color) ${percentage}%, rgba(255,255,255,0.1) ${percentage}%, rgba(255,255,255,0.1) 100%)`;
}

/* =========================================
   DİNAMİK SAHNE MOTORU (VISUAL FEAST) 🎬
   ========================================= */

// 1. Sahne Koleksiyonu (En kaliteli loop GIF'ler)
const visualScenes = [
    { 
        id: 'none', 
        name: 'Kapalı (Varsayılan)', 
        thumb: 'https://via.placeholder.com/150/000000/FFFFFF/?text=OFF', 
        url: '' 
    },
    { 
        id: 'lofi_room', 
        name: 'Lofi Çalışma Odası', 
        thumb: 'https://i.gifer.com/7d20.gif', 
        url: 'https://i.gifer.com/7d20.gif' 
    },
    { 
        id: 'train_night', 
        name: 'Gece Treni', 
        thumb: 'https://i.gifer.com/origin/f1/f1a75d557351680190184c8a221f7374_w200.gif', 
        url: 'https://i.gifer.com/origin/f1/f1a75d557351680190184c8a221f7374.gif' 
    },
    { 
        id: 'cozy_coffee', 
        name: 'Sıcak Kahve', 
        thumb: 'https://i.gifer.com/75yI.gif', 
        url: 'https://i.gifer.com/75yI.gif' 
    },
    { 
        id: 'rainy_window', 
        name: 'Yağmurlu Cam', 
        thumb: 'https://i.gifer.com/Riz.gif', 
        url: 'https://i.gifer.com/Riz.gif' 
    },
    { 
        id: 'pixel_city', 
        name: 'Pixel Şehir', 
        thumb: 'https://i.gifer.com/1k1.gif', 
        url: 'https://i.gifer.com/1k1.gif' 
    },
    { 
        id: 'cyberpunk', 
        name: 'Cyberpunk Neon', 
        thumb: 'https://i.gifer.com/XFqV.gif', 
        url: 'https://i.gifer.com/XFqV.gif' 
    },
    { 
        id: 'forest_camp', 
        name: 'Kamp Ateşi', 
        thumb: 'https://i.gifer.com/G4t1.gif', 
        url: 'https://i.gifer.com/G4t1.gif' 
    }
];

// 2. Modalı Aç ve Listeyi Doldur
function openSceneModal() {
    const modal = document.getElementById('scene-modal');
    const grid = document.getElementById('scene-grid');
    const currentSceneId = localStorage.getItem('currentScene') || 'none';
    
    modal.classList.remove('hidden');
    grid.innerHTML = '';

    visualScenes.forEach(scene => {
        const div = document.createElement('div');
        div.className = `scene-card ${currentSceneId === scene.id ? 'active' : ''}`;
        div.innerHTML = `
            <img src="${scene.thumb}" loading="lazy">
            <div class="scene-name">${scene.name}</div>
        `;
        div.onclick = () => changeScene(scene);
        grid.appendChild(div);
    });
}

// 3. Sahneyi Değiştir
function changeScene(scene) {
    const bg = document.getElementById('dynamic-scene-bg');
    
    // Hafızaya kaydet
    localStorage.setItem('currentScene', scene.id);

    if (scene.id === 'none') {
        // Varsayılan (Gizle)
        bg.style.opacity = 0;
        setTimeout(() => bg.style.backgroundImage = 'none', 500);
    } else {
        // Yeni sahneyi yükle
        // Önce opaklığı düşür (geçiş efekti için)
        bg.style.opacity = 0;
        
        setTimeout(() => {
            bg.style.backgroundImage = `url('${scene.url}')`;
            bg.style.opacity = 0.4; // %40 Opaklık (Yazılar okunsun diye)
        }, 300);
    }

    // Modalı kapat ve listeyi güncelle (Active sınıfı için)
    setTimeout(() => {
        document.getElementById('scene-modal').classList.add('hidden');
    }, 200);
}

// 4. Sayfa Yüklendiğinde Kayıtlı Sahneyi Aç
document.addEventListener('DOMContentLoaded', () => {
    const savedId = localStorage.getItem('currentScene');
    if(savedId && savedId !== 'none') {
        const scene = visualScenes.find(s => s.id === savedId);
        if(scene) {
            const bg = document.getElementById('dynamic-scene-bg');
            bg.style.backgroundImage = `url('${scene.url}')`;
            bg.style.opacity = 0.4;
        }
    }
});

// Yardımcı: Modal Kapatıcı
function closeSceneModal(e) {
    if(e.target.id === 'scene-modal') {
        document.getElementById('scene-modal').classList.add('hidden');
    }
}

/* =========================================
   PROFİL SAYFASI MOTORU 👤
   ========================================= */

function renderProfileView() {
    // 1. Sol menüdeki aktifliği kaldır (Çünkü artık profildeyiz)
    document.querySelectorAll('.menu-item, .playlist-item').forEach(e => e.classList.remove('active'));

    // 1. Verileri Çek
    const userName = localStorage.getItem('userName') || "Kaptan";
    const userAvatar = localStorage.getItem('userAvatar') || "https://via.placeholder.com/150";
    const totalSongs = allSongs.length;
    const totalFavs = favorites.length;
    const totalPlaylists = myPlaylists.length;
    const joinDate = "Aralık 2025"; // Sabit veya localStorage'a ilk giriş tarihi atabiliriz

    

    // 2. Rozet Mantığı (Gamification) 🏅
    // Şartları sağlarsan 'unlocked' sınıfı alırsın
    const badges = [
        { name: "Yeni Başlayan", icon: "fa-seedling", check: true }, // Herkes alır
        { name: "Müzik Kurdu", icon: "fa-headphones", check: totalSongs >= 10 },
        { name: "Seçici", icon: "fa-heart", check: totalFavs >= 5 },
        { name: "DJ", icon: "fa-list-music", check: totalPlaylists >= 2 },
        { name: "Gece Kuşu", icon: "fa-moon", check: new Date().getHours() >= 22 || new Date().getHours() < 6 } // Saat 22-06 arası bakarsan
    ];

    // 3. HTML Oluştur
    mainView.innerHTML = `
        <div class="profile-container" style="padding: 20px; max-width: 900px; margin: 0 auto;">
            
            <div class="profile-header">
                <img src="${userAvatar}" class="profile-big-avatar">
                <div style="flex:1;">
                    <h1 style="font-size: 2.5rem; margin-bottom: 5px; line-height:1;">${userName}</h1>
                    <p style="color: #aaa; font-size: 0.9rem;"><i class="fa-regular fa-calendar"></i> Üyelik: ${joinDate}</p>
                    
                    <div class="signature-quote-box" onclick="editSignature()" title="Değiştirmek için tıkla">
                        <span id="profile-signature" class="signature-text">"Bâkî kalan bu kubbede bir hoş sadâ imiş..."</span>
                        <i class="fa-solid fa-pen signature-icon"></i>
                    </div>

                </div>
            </div>

            <h3 style="margin-bottom:15px; border-left:3px solid var(--primary-color); padding-left:10px;">İstatistikler</h3>
            <div class="profile-stats-grid">
                <div class="stat-card">
                    <div class="stat-icon-box"><i class="fa-solid fa-music"></i></div>
                    <div>
                        <h2 style="margin:0;">${totalSongs}</h2>
                        <span style="color:#aaa; font-size:0.8rem;">Toplam Şarkı</span>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon-box" style="color:#e74c3c;"><i class="fa-solid fa-heart"></i></div>
                    <div>
                        <h2 style="margin:0;">${totalFavs}</h2>
                        <span style="color:#aaa; font-size:0.8rem;">Favori</span>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon-box" style="color:#f39c12;"><i class="fa-solid fa-list"></i></div>
                    <div>
                        <h2 style="margin:0;">${totalPlaylists}</h2>
                        <span style="color:#aaa; font-size:0.8rem;">Çalma Listesi</span>
                    </div>
                </div>
            </div>

            <div class="mood-tracker-container">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <h3 style="margin:0;"><i class="fa-solid fa-calendar-days" style="color:#2ecc71;"></i> Ruh Hali Takvimi (Son 30 Gün)</h3>
                    <div style="font-size:0.7rem; color:#aaa;">
                        <span style="color:#f1c40f">● Enerjik</span> 
                        <span style="color:#3498db">● Hüzünlü</span> 
                        <span style="color:#e67e22">● Chill</span>
                        <span style="color:#9b59b6">● Odak</span>
                    </div>
                </div>
                <div class="mood-grid-pixels" id="mood-pixels-area">
                </div>
            </div>
            <div class="badge-container">
                <h3 style="margin:0;"><i class="fa-solid fa-medal" style="color:#f1c40f;"></i> Koleksiyonun</h3>
                <div class="badge-grid">
                    ${badges.map(b => `
                        <div class="badge-item ${b.check ? 'unlocked' : ''}" title="${b.check ? 'Kazanıldı' : 'Kilitli'}">
                            <i class="fa-solid ${b.icon}"></i> ${b.name}
                        </div>
                    `).join('')}
                </div>
            </div>

        </div>
    `;
    generateMoodPixels();
    loadSignature();
}

/* =========================================
   MOOD PİXEL GENERATOR (GERÇEK VERİ v2) 🎨
   ========================================= */
function generateMoodPixels() {
    const container = document.getElementById('mood-pixels-area');
    if(!container) return;
    
    container.innerHTML = ''; // Temizle

    // 1. Gerçek Veriyi Çek
    const history = JSON.parse(localStorage.getItem('moodHistory')) || {};
    const today = new Date();

    // 2. Son 30 Günü Döngüye Al
    for(let i=29; i>=0; i--) {
        const d = new Date();
        d.setDate(today.getDate() - i);
        
        // Tarih formatı (Örn: "2023-12-25") - Kaydederkenki formatla aynı olmalı
        const dateKey = d.toISOString().split('T')[0];
        
        // Tooltip için güzel tarih (Örn: "25 Ara")
        const dateDisplay = d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });

        // Veritabanında bugün için kayıt var mı?
        const recordedMood = history[dateKey]; // 'energetic', 'sad', vb. ya da undefined
        
        // Kutuyu Oluştur
        const div = document.createElement('div');
        // Eğer kayıt varsa o sınıfı ekle, yoksa 'empty' olsun
        div.className = `pixel ${recordedMood ? recordedMood : ''}`;
        div.dataset.date = dateDisplay;
        
        // Kayıt yoksa sönük dursun
        if(!recordedMood) {
            div.style.background = 'rgba(255,255,255,0.05)';
            div.style.border = '1px dashed rgba(255,255,255,0.1)'; // Boş olduğu belli olsun
        }
        
        container.appendChild(div);
    }
}

/* =========================================
   İMZA SÖZ (MOTTO) SİSTEMİ ✒️
   ========================================= */

// 1. Profil Yüklenirken Sözü Getir
// (Bunu renderProfileView fonksiyonunun EN SONUNA eklemen lazım)
// loadSignature();  <-- Bunu aşağıda anlatacağım yere ekle.

function loadSignature() {
    const savedQuote = localStorage.getItem('userSignature');
    const el = document.getElementById('profile-signature');
    if(el && savedQuote) {
        el.innerText = `"${savedQuote}"`;
    }
}

// 2. Tıklayınca Değiştir
function editSignature() {
    const current = localStorage.getItem('userSignature') || "Bâkî kalan bu kubbede bir hoş sadâ imiş...";
    const newQuote = prompt("İmza sözünü yaz (Beyit, ruh hali, motto):", current);
    
    if(newQuote && newQuote.trim() !== "") {
        localStorage.setItem('userSignature', newQuote.trim());
        
        // Ekranda anlık güncelle
        const el = document.getElementById('profile-signature');
        if(el) el.innerText = `"${newQuote.trim()}"`;
    }
}

/* =========================================
   GERÇEK MOOD TAKİP SİSTEMİ (DATABASE) 💾
   ========================================= */

function saveDailyMood(mood) {
    if(!mood) return; // Şarkının modu yoksa kaydetme

    // 1. Geçmişi Çek
    let history = JSON.parse(localStorage.getItem('moodHistory')) || {};
    
    // 2. Bugünün Tarihini Oluştur (Örn: "2023-12-25")
    const today = new Date().toISOString().split('T')[0];
    
    // 3. Bugüne bu modu yaz (Son dinlenen geçerli olur)
    history[today] = mood;
    
    // 4. Geri Kaydet
    localStorage.setItem('moodHistory', JSON.stringify(history));
    
    console.log(`📅 Günlük Mod Güncellendi: ${today} -> ${mood}`);
}

/* =========================================
   YEDEKLEME SİSTEMİ (DATA MANAGER - FIX v2) 💾
   ========================================= */

// Yardımcı: Blob <-> Base64 Çevirici
const blobToBase64 = blob => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
    reader.readAsDataURL(blob);
});

const base64ToBlob = async (base64) => {
    const res = await fetch(base64);
    return await res.blob();
};

// 1. YEDEK AL (DIŞA AKTAR) - Transaction Hatası Giderildi ✅
window.exportBackup = async function() {
    const btn = document.querySelector('.backup-btn');
    const originalText = btn ? btn.innerHTML : "İndir";
    
    if(btn) btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Veriler Çekiliyor...';

    try {
        const backup = {
            version: "2.1",
            date: new Date().toISOString(),
            localStorage: { ...localStorage },
            songs: [],
            covers: []
        };

        // ADIM 1: Veritabanından HAM verileri çek (Await kullanmadan hızlıca)
        // Transaction'ı burada açıp işimiz bitince hemen kapatacağız.
        const [rawSongs, rawCovers] = await new Promise((resolve, reject) => {
            const tx = db.transaction([storeName, "playlist_covers"], "readonly");
            const songStore = tx.objectStore(storeName);
            const coverStore = tx.objectStore("playlist_covers");

            let songs = [];
            let covers = [];

            // Şarkıları İste
            songStore.getAll().onsuccess = (e) => {
                songs = e.target.result;
            };

            // Kapakları İste (Cursor ile)
            coverStore.openCursor().onsuccess = (e) => {
                const cursor = e.target.result;
                if(cursor) {
                    covers.push({ id: cursor.key, blob: cursor.value });
                    cursor.continue();
                }
            };

            // Transaction tamamlanınca verileri teslim et
            tx.oncomplete = () => resolve([songs, covers]);
            tx.onerror = (e) => reject(e);
        });

        // ADIM 2: Veritabanı kapandı, şimdi elimizdeki veriyi sakince işleyebiliriz.
        if(btn) btn.innerHTML = '<i class="fa-solid fa-gear fa-spin"></i> Paketleniyor...';

        // Şarkıları Dönüştür
        for (const s of rawSongs) {
            if(s.blob instanceof Blob) {
                s.blob = await blobToBase64(s.blob); 
            }
            backup.songs.push(s);
        }

        // Kapakları Dönüştür
        for (const c of rawCovers) {
            if(c.blob instanceof Blob) {
                const b64 = await blobToBase64(c.blob);
                backup.covers.push({ id: c.id, data: b64 });
            }
        }

        // ADIM 3: İndir
        const dataStr = JSON.stringify(backup);
        const blob = new Blob([dataStr], {type: "application/json"});
        const url = URL.createObjectURL(blob);
        
        const downloadAnchor = document.createElement('a');
        downloadAnchor.href = url;
        downloadAnchor.download = `MoodPlayer_Yedek_${new Date().toLocaleDateString('tr-TR').replace(/\./g, '-')}.json`;
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
        URL.revokeObjectURL(url);
        
        if(btn) {
            btn.innerHTML = '<i class="fa-solid fa-check"></i> İndi!';
            setTimeout(() => btn.innerHTML = originalText, 3000);
        }

    } catch (e) {
        console.error(e);
        alert("Yedekleme hatası: " + e.message);
        if(btn) btn.innerHTML = originalText;
    }
};

// 2. YEDEK YÜKLE (İÇE AKTAR) - Transaction Hatası Giderildi ✅
window.importBackup = function(input) {
    const file = input.files[0];
    if(!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = JSON.parse(e.target.result);
            
            if(!confirm(`Yedek dosyasında ${data.songs.length} şarkı var. Mevcut verilerin silinip yüklensin mi?`)) {
                input.value = ""; 
                return;
            }

            // ADIM 1: Önce tüm verileri RAM'de Blob'a çevir (DB'yi meşgul etme)
            const readySongs = [];
            for (const s of data.songs) {
                if(s.blob && typeof s.blob === 'string' && s.blob.startsWith('data:')) {
                    s.blob = await base64ToBlob(s.blob); 
                }
                readySongs.push(s);
            }

            const readyCovers = [];
            if(data.covers) {
                for (const c of data.covers) {
                    const blob = await base64ToBlob(c.data);
                    readyCovers.push({ id: c.id, blob: blob });
                }
            }

            // ADIM 2: LocalStorage'ı Yükle
            localStorage.clear();
            for (const key in data.localStorage) {
                localStorage.setItem(key, data.localStorage[key]);
            }

            // ADIM 3: Veritabanına Yaz (Tek seferde, hızlıca)
            const tx = db.transaction([storeName, "playlist_covers"], "readwrite");
            
            // Temizle
            tx.objectStore(storeName).clear();
            tx.objectStore("playlist_covers").clear();

            // Yaz
            const songStore = tx.objectStore(storeName);
            readySongs.forEach(s => songStore.put(s));

            const coverStore = tx.objectStore("playlist_covers");
            readyCovers.forEach(c => coverStore.put(c.blob, c.id));

            tx.oncomplete = () => {
                alert("Yedek başarıyla yüklendi! Sayfa yenileniyor... 🔄");
                location.reload();
            };

            tx.onerror = (err) => {
                console.error(err);
                alert("Veritabanına yazarken hata oluştu.");
            };

        } catch (err) {
            console.error(err);
            alert("Dosya bozuk veya hatalı JSON formatı.");
        }
    };
    reader.readAsText(file);
};

/* =================================================================
   MOOD PLAYER - ALL-IN-ONE EXTENSION PACK
   (Arama Motoru + Yeni Tasarım Bildirimler + Sistem Bağlantıları)
   ================================================================= */

/* -----------------------------------------------------------
   1. YENİ ARAMA MOTORU (CANLI ARAMA & ARŞİV)
   ----------------------------------------------------------- */

// Arama kutusunu "Canlı Arama"ya çeviren yama
const searchPatchInterval = setInterval(() => {
    const searchInput = document.getElementById('search-input');
    if (searchInput && !searchInput.dataset.patched) {
        // Eski eventleri temizlemek için klonla ve değiştir
        const newInput = searchInput.cloneNode(true);
        searchInput.parentNode.replaceChild(newInput, searchInput);
        
        newInput.dataset.patched = "true";
        newInput.placeholder = "Müzik ara...";
        
        let typingTimer;
        newInput.addEventListener('input', (e) => {
            const query = e.target.value.trim();
            clearTimeout(typingTimer);
            
            if (query.length > 2) {
                // 600ms bekle sonra ara
                typingTimer = setTimeout(() => executeGlobalSearch(query), 600);
            } else if (query.length === 0) {
                if(typeof renderHomeView === 'function') renderHomeView();
            }
        });
        clearInterval(searchPatchInterval);
    }
}, 1000);

// Global Arama Başlatıcı
async function executeGlobalSearch(query) {
    const mainView = document.getElementById('main-view');
    mainView.innerHTML = `<div style="text-align:center;padding:50px;color:#aaa;"><i class="fa-solid fa-circle-notch fa-spin fa-2x"></i><h3>Aranıyor: ${query}</h3></div>`;

    try {
        const [itunes, archive] = await Promise.all([
            fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&limit=6`).then(r=>r.json()).then(d=>d.results||[]).catch(()=>[]),
            fetch(`https://archive.org/advancedsearch.php?q=${encodeURIComponent('('+query+') AND mediatype:(audio)')}&fl[]=identifier,title,creator,downloads&sort[]=-downloads&rows=10&output=json`).then(r=>r.json()).then(d=>d.response.docs||[]).catch(()=>[])
        ]);
        renderGlobalResults(query, itunes, archive);
    } catch (e) { mainView.innerHTML = `<div style="text-align:center;">Hata: ${e.message}</div>`; }
}

// Sonuçları Ekrana Bas
function renderGlobalResults(query, itunesList, archiveList) {
    const mainView = document.getElementById('main-view');
    let html = `<div style="padding:20px;"><h2>🔍 "${query}" Sonuçları</h2>`;

    // iTunes Sonuçları
    if (itunesList.length > 0) {
        html += `<h4 style="color:#ff5e57;border-bottom:1px solid rgba(255,255,255,0.1);margin-top:20px;padding-bottom:5px;">iTunes (Demo)</h4><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:15px;margin-top:10px;">`;
        itunesList.forEach(i => {
            const cover = i.artworkUrl100.replace('100x100','300x300');
            // Veriyi güvenli şekilde string'e çevir
            const sData = encodeURIComponent(JSON.stringify({id:'it-'+i.trackId, name:i.trackName, artist:i.artistName, cover:cover, source:i.previewUrl, path:i.previewUrl, category:'itunes'}));
            
            html += `
            <div class="song-card" style="border:1px dashed #ff5e57;">
                <div class="card-img-wrapper" onclick="playSongFromData('${sData}')"><img src="${cover}"><div class="card-play-btn"><i class="fa-solid fa-play"></i></div></div>
                <div class="card-title">${i.trackName}</div>
                <div class="card-artist">${i.artistName}</div>
                <button onclick="addToLibrarySimple('${sData}', this)" style="width:100%;margin-top:5px;background:rgba(255,255,255,0.1);border:none;color:#fff;padding:5px;cursor:pointer;border-radius:4px;">+ Ekle</button>
            </div>`;
        });
        html += `</div>`;
    }

    // Archive.org Sonuçları
    if (archiveList.length > 0) {
        html += `<h4 style="color:#f1c40f;border-bottom:1px solid rgba(255,255,255,0.1);margin-top:30px;padding-bottom:5px;">Archive.org (Tam Sürüm)</h4><div style="display:flex;flex-direction:column;gap:10px;margin-top:10px;">`;
        archiveList.forEach(i => {
            let t = Array.isArray(i.title) ? i.title[0] : (i.title||"Adsız");
            let a = Array.isArray(i.creator) ? i.creator.join(', ') : (i.creator||"Bilinmiyor");
            
            html += `
            <div style="display:flex;align-items:center;background:rgba(255,255,255,0.05);padding:10px;border-radius:8px;">
                <div style="width:40px;height:40px;background:#222;display:flex;align-items:center;justify-content:center;border-radius:5px;margin-right:15px;"><i class="fa-solid fa-music" style="color:#888;"></i></div>
                <div style="flex:1;"><div style="font-weight:bold;">${t}</div><div style="font-size:0.8rem;color:#aaa;">${a}</div></div>
                <button onclick="resolveArchive('${i.identifier}','${t}','${a}','play')" style="background:var(--primary-color);border:none;color:white;width:35px;height:35px;border-radius:50%;margin-right:10px;cursor:pointer;"><i class="fa-solid fa-play"></i></button>
                <button onclick="resolveArchive('${i.identifier}','${t}','${a}','add')" style="background:rgba(255,255,255,0.1);border:1px solid #555;color:white;width:35px;height:35px;border-radius:50%;cursor:pointer;"><i class="fa-solid fa-plus"></i></button>
            </div>`;
        });
        html += `</div>`;
    }
    html += `</div>`;
    mainView.innerHTML = html;
}

// Yardımcılar
function playSongFromData(encodedData) {
    const s = JSON.parse(decodeURIComponent(encodedData));
    if(typeof currentPlaylist !== 'undefined') currentPlaylist = [s];
    if(typeof loadSong === 'function') { loadSong(s); safePlay(); }
}

function addToLibrarySimple(encodedData, btn) {
    const s = JSON.parse(decodeURIComponent(encodedData));
    s.dateAdded = Date.now(); 
    s.category = 'userUploads'; 
    // Mood satırı silindi, virgül/noktalı virgül hatası olmaması için temizlendi.
    
    if(!allSongs.find(x=>x.id===s.id) && !allSongs.find(x=>x.name===s.name)) {
        allSongs.push(s);
        if(db) db.transaction("songs", "readwrite").objectStore("songs").add(s);
        showNotification("Eklendi", "success", `${s.name} kütüphaneye eklendi.`);
        if(btn) { btn.innerHTML = "✓"; btn.style.background = "#2ecc71"; }
    } else {
        showNotification("Zaten Var", "warning", "Bu şarkı zaten kütüphanede.");
    }
}

async function resolveArchive(id, title, artist, mode) {
    showNotification("Bağlanıyor...", "info", "Arşiv taranıyor");
    
    // Basit bir tahmin URL'i
    const guessUrl = `https://archive.org/download/${id}/${id}.mp3`;
    
    // Mood: 'chill' silindi, parantez ve virgüller düzeltildi
    let song = { 
        id: id, 
        name: title, 
        artist: artist, 
        source: guessUrl, 
        path: guessUrl, 
        cover: "https://via.placeholder.com/150?text=Archive", 
        category: 'userUploads', 
        dateAdded: Date.now() 
    };

    try {
        const res = await fetch(`https://archive.org/metadata/${id}`);
        const data = await res.json();
        let mp3 = data.files.find(f => f.format === 'VBR MP3' || f.format === 'MP3');
        if(mp3) {
            song.source = `https://archive.org/download/${id}/${encodeURIComponent(mp3.name)}`;
            song.path = song.source;
        }
    } catch(e) { console.log("Metadata hatası, tahmin kullanılıyor."); }

    if(mode === 'play') {
        currentPlaylist = [song]; currentIndex=0; loadSong(song); safePlay();
        showNotification("Oynatılıyor", "success", title);
    } else {
        if(!allSongs.find(x=>x.id===song.id)) {
            allSongs.push(song);
            if(db) db.transaction("songs", "readwrite").objectStore("songs").add(song);
            showNotification("Eklendi", "success", "Şarkı kütüphaneye eklendi.");
        }
    }
}


/* -----------------------------------------------------------
   2. UI ENGINE (BİLDİRİM & MODAL SİSTEMİ)
   ----------------------------------------------------------- */

// BİLDİRİM (TOAST) GÖSTERİCİ
function showNotification(title, type = 'info', message = '') {
    let area = document.getElementById('notification-area');
    if(!area) { // Eğer HTML'de yoksa otomatik yarat
        area = document.createElement('div'); area.id='notification-area'; document.body.appendChild(area);
    }
    
    let iconClass = 'fa-circle-info';
    if(type === 'success') iconClass = 'fa-circle-check';
    if(type === 'error') iconClass = 'fa-circle-xmark';
    if(type === 'warning') iconClass = 'fa-triangle-exclamation';

    const toast = document.createElement('div');
    toast.className = `toast-card ${type}`;
    toast.innerHTML = `
        <div class="toast-icon"><i class="fa-solid ${iconClass}"></i></div>
        <div class="toast-content"><h4>${title}</h4>${message ? `<p>${message}</p>` : ''}</div>
    `;

    area.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 400);
    }, 4000);
}

// ÖZEL INPUT PENCERESİ (PROMPT Yerine)
function openInputModal(title, placeholder, confirmText, callback) {
    const old = document.querySelector('.modal-overlay.temp-ui');
    if (old) old.remove();

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay temp-ui'; // temp-ui sınıfı çakışmayı önler
    overlay.innerHTML = `
        <div class="modal-content" style="width:350px; text-align:center;">
            <h3 style="margin-bottom:15px;">${title}</h3>
            <input type="text" id="ui-custom-input" placeholder="${placeholder}" style="width:100%; padding:10px; margin-bottom:20px; background:rgba(255,255,255,0.1); border:1px solid rgba(255,255,255,0.2); color:#fff; border-radius:5px;">
            <div style="display:flex; justify-content:center; gap:10px;">
                <button class="modal-btn cancel">İptal</button>
                <button class="modal-btn save">${confirmText}</button>
            </div>
        </div>`;

    document.body.appendChild(overlay);
    
    // Otomatik odaklan ve görünür yap
    setTimeout(() => {
        overlay.classList.remove('hidden'); // style.css'deki hidden classı varsa kaldırsın
        overlay.style.display = 'flex';
        document.getElementById('ui-custom-input').focus();
    }, 10);

    const close = () => overlay.remove();
    const confirm = () => {
        const val = document.getElementById('ui-custom-input').value.trim();
        if(val) { callback(val); close(); }
    };

    overlay.querySelector('.save').onclick = confirm;
    overlay.querySelector('.cancel').onclick = close;
    document.getElementById('ui-custom-input').onkeydown = (e) => { if(e.key === 'Enter') confirm(); if(e.key === 'Escape') close(); };
}

// ÖZEL ONAY PENCERESİ (CONFIRM Yerine) - Promise döner
function showConfirm(title, message) {
    return new Promise((resolve) => {
        const old = document.querySelector('.modal-overlay.temp-ui');
        if (old) old.remove();

        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay temp-ui';
        overlay.innerHTML = `
            <div class="modal-content" style="width:350px; text-align:center;">
                <div style="font-size:3rem; color:#f1c40f; margin-bottom:10px;"><i class="fa-solid fa-circle-question"></i></div>
                <h3 style="margin-bottom:10px;">${title}</h3>
                <p style="color:#ccc; margin-bottom:20px;">${message}</p>
                <div style="display:flex; justify-content:center; gap:10px;">
                    <button class="modal-btn cancel">Vazgeç</button>
                    <button class="modal-btn save" style="background:#e74c3c;">Evet, Onayla</button>
                </div>
            </div>`;

        document.body.appendChild(overlay);
        overlay.style.display = 'flex';

        overlay.querySelector('.save').onclick = () => { overlay.remove(); resolve(true); };
        overlay.querySelector('.cancel').onclick = () => { overlay.remove(); resolve(false); };
    });
}


/* -----------------------------------------------------------
   3. SİSTEM BAĞLANTILARI (ESKİ KODLARI GÜNCELLEME)
   ----------------------------------------------------------- */

// 1. Liste Silme (Confirm -> showConfirm)
window.deletePlaylist = async function(id) {
    // ID veya İsim gelebilir, kontrol et
    const pl = myPlaylists.find(p => p.id == id) || myPlaylists.find(p => p.name === id);
    if (pl) {
        const onay = await showConfirm("Listeyi Sil?", `"${pl.name}" listesi silinecek. Emin misin?`);
        if(onay) {
            myPlaylists = myPlaylists.filter(p => p.id !== pl.id);
            localStorage.setItem('myPlaylists', JSON.stringify(myPlaylists));
            renderSidebar(); renderHomeView();
            showNotification("Silindi", "info", "Liste kaldırıldı.");
        }
    }
};

// 2. Uygulamayı Sıfırla
window.resetApp = async function() {
    const onay = await showConfirm("Fabrika Ayarları", "Tüm şarkılar ve ayarlar silinecek. Emin misin?");
    if(onay) {
        indexedDB.deleteDatabase(dbName);
        localStorage.clear();
        location.reload();
    }
};

// 3. İmza Düzenleme
window.editSignature = function() {
    const current = localStorage.getItem('userSignature') || "";
    openInputModal("İmzanı Düzenle", "Bugün nasılsın?", "Kaydet", (val) => {
        localStorage.setItem('userSignature', val);
        if(document.getElementById('profile-signature')) document.getElementById('profile-signature').innerText = `"${val}"`;
        showNotification("Güncellendi", "success", "İmzan değiştirildi.");
    });
};


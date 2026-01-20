/* =========================================
   MOOD PLAYER - MOBİL MODÜLÜ (PRO SÜRÜM) 📱
   Hem Yerel Kütüphane hem Web Araması
   ========================================= */

let mobileSearchTimer; // Yazarken bekletme zamanlayıcısı

/* -----------------------------------------
   1. NAVİGASYON (Alt Menü Işıkları)
   ----------------------------------------- */
function updateMobileNav(target) {
    const navBar = document.querySelector('.mobile-bottom-nav');
    if (!navBar) return;

    document.querySelectorAll('.mobile-bottom-nav .nav-item').forEach(el => el.classList.remove('active'));

    if (typeof target === 'string') {
        const el = document.getElementById(target);
        if (el) el.classList.add('active');
    } else if (target) {
        target.classList.add('active');
    }
}

/* -----------------------------------------
   2. ARAMA EKRANI & FONKSİYONLARI 🔍
   ----------------------------------------- */
const moodGridHTML = `
    <div class="browse-grid">
        <div class="browse-card" style="background:#f1c40f;" onclick="filterByMood('energetic', 'Enerjik ⚡')">
            <h3>Enerjik</h3> <i class="fa-solid fa-bolt"></i>
        </div>
        <div class="browse-card" style="background:#3498db;" onclick="filterByMood('sad', 'Hüzünlü 🌧️')">
            <h3>Hüzünlü</h3> <i class="fa-solid fa-cloud-rain"></i>
        </div>
         <div class="browse-card" style="background:#e74c3c;" onclick="filterByMood('chill', 'Chill ☕')">
            <h3>Chill</h3> <i class="fa-solid fa-mug-hot"></i>
        </div>
         <div class="browse-card" style="background:#9b59b6;" onclick="filterByMood('focus', 'Odaklan 🧠')">
            <h3>Odaklan</h3> <i class="fa-solid fa-brain"></i>
        </div>
    </div>
`;

function activateMobileSearch() {
    const mainView = document.getElementById('main-view');
    updateMobileNav('nav-search');

    mainView.innerHTML = `
        <h2 class="mobile-search-header" style="padding: 10px 20px 0;">Ara</h2>
        
        <div class="mobile-search-input-wrapper" style="margin: 10px 20px; position:relative;">
            <input type="text" id="mobile-search-input" class="mobile-search-input" placeholder="Şarkı, sanatçı veya web..." 
                   style="width: 100%; padding: 12px 40px 12px 15px; border-radius: 8px; border: none; background: rgba(255,255,255,0.1); color: white; font-size: 1rem; outline:none;">
            <i class="fa-solid fa-magnifying-glass mobile-search-icon" style="position: absolute; right: 15px; top: 50%; transform: translateY(-50%); color: #aaa;"></i>
        </div>

        <div id="mobile-search-results" style="padding: 0 20px; padding-bottom: 80px;">
            ${moodGridHTML} 
        </div>
    `;

    const searchInput = document.getElementById('mobile-search-input');
    
    // Klavye her tuşlandığında süre sayar, durunca arar (Debounce)
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value;
        clearTimeout(mobileSearchTimer);
        
        if (query.length > 1) {
            // 600ms yazmayı bırakmasını bekle, sonra ara (İnternet kotası ve performans için)
            mobileSearchTimer = setTimeout(() => performMobileSearch(query), 600);
        } else {
            document.getElementById('mobile-search-results').innerHTML = moodGridHTML;
        }
    });
    
    searchInput.focus();
}

async function performMobileSearch(query) {
    const resultsContainer = document.getElementById('mobile-search-results');
    
    if (!query || query.trim().length < 2) {
        resultsContainer.innerHTML = moodGridHTML;
        return; 
    }

    // Yükleniyor simgesi göster
    resultsContainer.innerHTML = `<div style="text-align:center; padding:20px; color:#aaa;"><i class="fa-solid fa-spinner fa-spin"></i> Aranıyor...</div>`;

    // 1. YEREL KÜTÜPHANE ARAMASI (Hatasız)
    let localResults = [];
    if (typeof allSongs !== 'undefined' && Array.isArray(allSongs)) {
        localResults = allSongs.filter(song => {
            const sName = (song.name || "").toString().toLocaleLowerCase('tr');
            const sArtist = (song.artist || "").toString().toLocaleLowerCase('tr');
            const q = query.toLocaleLowerCase('tr');
            return sName.includes(q) || sArtist.includes(q);
        });
    }

    // 2. WEB ARAMASI (iTunes + Archive.org) - app.js'deki mantığı kullanır
    let webResultsHTML = "";
    try {
        const [itunes, archive] = await Promise.all([
            fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&limit=4`).then(r=>r.json()).then(d=>d.results||[]).catch(()=>[]),
            fetch(`https://archive.org/advancedsearch.php?q=${encodeURIComponent('('+query+') AND mediatype:(audio)')}&fl[]=identifier,title,creator,downloads&sort[]=-downloads&rows=4&output=json`).then(r=>r.json()).then(d=>d.response.docs||[]).catch(()=>[])
        ]);

        // iTunes HTML Oluştur
        if (itunes.length > 0) {
            webResultsHTML += `<h4 style="color:#ff5e57; margin-top:20px; margin-bottom:10px; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:5px;">iTunes (Demo)</h4>`;
            itunes.forEach(i => {
                const cover = i.artworkUrl100.replace('100x100','300x300');
                const sData = encodeURIComponent(JSON.stringify({id:'it-'+i.trackId, name:i.trackName, artist:i.artistName, cover:cover, source:i.previewUrl, path:i.previewUrl, category:'itunes'}));
                
                webResultsHTML += `
                <div class="song-item" style="display: flex; align-items: center; padding: 10px; border-bottom: 1px solid rgba(255,255,255,0.05);"> 
                    <img src="${cover}" style="width: 50px; height: 50px; border-radius: 4px; object-fit: cover; margin-right: 15px;">
                    <div class="song-info" style="flex: 1;" onclick="playSongFromData('${sData}')">
                        <h4 style="margin: 0; font-size: 1rem; color: white;">${i.trackName}</h4>
                        <p style="margin: 3px 0 0; font-size: 0.8rem; color: #aaa;">${i.artistName}</p>
                    </div>
                    <button onclick="addToLibrarySimple('${sData}', this)" style="background: rgba(255,255,255,0.1); border: none; color: #fff; width:35px; height:35px; border-radius:50%;"><i class="fa-solid fa-plus"></i></button>
                </div>`;
            });
        }

        // Archive HTML Oluştur
        if (archive.length > 0) {
            webResultsHTML += `<h4 style="color:#f1c40f; margin-top:20px; margin-bottom:10px; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:5px;">Archive.org</h4>`;
            archive.forEach(i => {
                let t = Array.isArray(i.title) ? i.title[0] : (i.title||"Adsız");
                let a = Array.isArray(i.creator) ? i.creator.join(', ') : (i.creator||"Bilinmiyor");
                
                webResultsHTML += `
                <div class="song-item" style="display: flex; align-items: center; padding: 10px; border-bottom: 1px solid rgba(255,255,255,0.05);"> 
                    <div style="width: 50px; height: 50px; background:#222; border-radius: 4px; display:flex; align-items:center; justify-content:center; margin-right:15px;"><i class="fa-solid fa-music" style="color:#666;"></i></div>
                    <div class="song-info" style="flex: 1;">
                        <h4 style="margin: 0; font-size: 1rem; color: white;">${t}</h4>
                        <p style="margin: 3px 0 0; font-size: 0.8rem; color: #aaa;">${a}</p>
                    </div>
                    <button onclick="resolveArchive('${i.identifier}','${t}','${a}','play')" style="background: var(--primary-color); border: none; color: #fff; width:35px; height:35px; border-radius:50%; margin-right:5px;"><i class="fa-solid fa-play"></i></button>
                    <button onclick="resolveArchive('${i.identifier}','${t}','${a}','add')" style="background: rgba(255,255,255,0.1); border: none; color: #fff; width:35px; height:35px; border-radius:50%;"><i class="fa-solid fa-plus"></i></button>
                </div>`;
            });
        }

    } catch (e) {
        console.error("Web arama hatası:", e);
    }

    // 3. SONUÇLARI BİRLEŞTİR VE BAS
    let finalHTML = "";

    // Yerel Sonuçlar Varsa
    if (localResults.length > 0) {
        finalHTML += `<h4 style="color:var(--primary-color); margin-bottom:10px; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:5px;">Kütüphanem</h4>`;
        localResults.forEach(song => {
            const safeCover = song.cover || 'https://via.placeholder.com/150';
            finalHTML += `
                <div class="song-item" onclick="playFeaturedSong(${song.id})" style="display: flex; align-items: center; padding: 10px; border-bottom: 1px solid rgba(255,255,255,0.05); cursor: pointer;"> 
                    <img src="${safeCover}" style="width: 50px; height: 50px; border-radius: 4px; object-fit: cover; margin-right: 15px;">
                    <div class="song-info" style="flex: 1;">
                        <h4 style="margin: 0; font-size: 1rem; color: white;">${song.name}</h4>
                        <p style="margin: 3px 0 0; font-size: 0.8rem; color: #aaa;">${song.artist}</p>
                    </div>
                    <button class="play-icon-btn" style="background: none; border: none; color: var(--primary-color); font-size: 1.2rem;"><i class="fa-solid fa-play"></i></button>
                </div>
            `;
        });
    }

    // Web Sonuçlarını Ekle
    finalHTML += webResultsHTML;

    // Hiçbir şey yoksa
    if (localResults.length === 0 && webResultsHTML === "") {
        finalHTML = `<div style="text-align:center; margin-top:50px; color:#666;">
            <i class="fa-regular fa-face-frown" style="font-size:3rem; margin-bottom:10px;"></i>
            <p>"${query}" ne kütüphanede ne de web'de bulunamadı.</p>
        </div>`;
    }

    resultsContainer.innerHTML = finalHTML;
}

/* -----------------------------------------
   3. KİTAPLIK GÖRÜNÜMÜ 📚 (GÜNCELLENDİ)
   ----------------------------------------- */
function renderLibraryView() {
    const mainView = document.getElementById('main-view');
    updateMobileNav('nav-library');
    
    // Header ve Sabit Listeler
    let html = `
        <div style="padding: 20px; padding-bottom: 80px;">
            <h1 style="font-size: 2rem; margin-bottom: 20px;">Kitaplığın</h1>
            
            <div class="library-item" onclick="setActiveMenu('favorites-link'); renderPlaylistView('Beğenilenler', allSongs.filter(s=>favorites.includes(s.id)), 'standard')"
                 style="display:flex; align-items:center; margin-bottom:15px; cursor:pointer;">
                <div style="width:60px; height:60px; background:linear-gradient(135deg, #4b6cb7, #182848); display:flex; align-items:center; justify-content:center; border-radius:8px; margin-right:15px;">
                    <i class="fa-solid fa-heart" style="color:white; font-size:1.5rem;"></i>
                </div>
                <div>
                    <h3 style="margin:0;">Beğenilenler</h3>
                    <p style="margin:0; color:#aaa; font-size:0.8rem;">${typeof favorites !== 'undefined' ? favorites.length : 0} şarkı</p>
                </div>
            </div>

            <div class="library-item" onclick="setActiveMenu('uploads-link'); renderPlaylistView('Eklediklerim', allSongs.filter(s=>s.category==='userUploads'), 'uploads')"
                 style="display:flex; align-items:center; margin-bottom:15px; cursor:pointer;">
                <div style="width:60px; height:60px; background:linear-gradient(135deg, #11998e, #38ef7d); display:flex; align-items:center; justify-content:center; border-radius:8px; margin-right:15px;">
                    <i class="fa-solid fa-cloud-arrow-up" style="color:white; font-size:1.5rem;"></i>
                </div>
                <div>
                    <h3 style="margin:0;">Eklediklerim</h3>
                    <p style="margin:0; color:#aaa; font-size:0.8rem;">Senin Yüklediklerin</p>
                </div>
            </div>
            
            <h3 style="margin-top:30px; margin-bottom:15px; font-size:1.2rem; border-top:1px solid rgba(255,255,255,0.1); padding-top:20px;">Çalma Listelerin</h3>

            <div class="library-item" onclick="createNewPlaylistMobile()"
                 style="display:flex; align-items:center; margin-bottom:15px; cursor:pointer; opacity: 0.9;">
                <div style="width:60px; height:60px; border: 2px dashed rgba(255,255,255,0.3); border-radius:8px; display:flex; align-items:center; justify-content:center; margin-right:15px;">
                    <i class="fa-solid fa-plus" style="color:white; font-size:1.5rem;"></i>
                </div>
                <div>
                    <h3 style="margin:0; color: var(--primary-color);">Liste Oluştur</h3>
                    <p style="margin:0; color:#aaa; font-size:0.8rem;">Yeni bir koleksiyon</p>
                </div>
            </div>
    `;

    // Kullanıcı Listeleri
    if(typeof myPlaylists !== 'undefined' && myPlaylists.length > 0) {
        myPlaylists.forEach(pl => {
            html += `
            <div class="library-item" onclick="openPlaylistFromHome('${pl.id}')"
                 style="display:flex; align-items:center; margin-bottom:15px; cursor:pointer;">
                <div style="width:60px; height:60px; background:#333; display:flex; align-items:center; justify-content:center; border-radius:8px; margin-right:15px;">
                     <i class="fa-solid fa-music" style="color:#666; font-size:1.5rem;"></i>
                </div>
                <div>
                    <h3 style="margin:0;">${pl.name}</h3>
                    <p style="margin:0; color:#aaa; font-size:0.8rem;">${pl.songs.length} şarkı</p>
                </div>
            </div>`;
        });
    }

    html += `</div>`;
    mainView.innerHTML = html;
}

// MOBİL İÇİN LİSTE OLUŞTURMA FONKSİYONU
function createNewPlaylistMobile() {
    // app.js içindeki openInputModal fonksiyonunu kullanır
    openInputModal(
        "Yeni Liste Oluştur", 
        "Örn: Yol Şarkıları", 
        "Oluştur", 
        (name) => {
            const newPl = { id: Date.now(), name: name, songs: [] };
            myPlaylists.push(newPl);
            localStorage.setItem('myPlaylists', JSON.stringify(myPlaylists));
            
            showNotification("Başarılı", "success", `"${name}" listesi oluşturuldu.`);
            
            // Sayfayı yenile ki yeni liste görünsün
            renderLibraryView();
        }
    );
}
/* -----------------------------------------
   3. KİTAPLIK GÖRÜNÜMÜ 📚 (AKILLI: PC vs MOBİL)
   ----------------------------------------- */
function renderPlaylistView(title, songs, listType = 'standard') {
    const mainView = document.getElementById('main-view');
    updateMobileNav('nav-library');
    
    // 1. HEADER (ORTAK ALAN)
    // Listeye göre ikon veya kapak resmi belirle
    let coverHTML = `<div style="width:100%; height:100%; background:linear-gradient(135deg, #4b6cb7, #182848); display:flex; align-items:center; justify-content:center;"><i class="fa-solid fa-music" style="font-size:3rem; color:rgba(255,255,255,0.5);"></i></div>`;
    
    const currentPlObj = typeof myPlaylists !== 'undefined' ? myPlaylists.find(p => p.name === title) : null;
    if(listType === 'userPlaylist' && currentPlObj) {
        coverHTML = `<img id="view-cover-${currentPlObj.id}" src="https://via.placeholder.com/300?text=..." style="width:100%; height:100%; object-fit:cover;">`;
        setTimeout(() => {
            const el = document.getElementById(`view-cover-${currentPlObj.id}`);
            if(el) setCoverImageFromDB(currentPlObj.id, el);
        }, 50);
    } else if (title === 'Beğenilenler') {
        coverHTML = `<div style="width:100%; height:100%; background:linear-gradient(135deg, #4b6cb7, #182848); display:flex; align-items:center; justify-content:center;"><i class="fa-solid fa-heart" style="font-size:4rem; color:white;"></i></div>`;
    } else if (title === 'Eklediklerim') {
        coverHTML = `<div style="width:100%; height:100%; background:linear-gradient(135deg, #11998e, #38ef7d); display:flex; align-items:center; justify-content:center;"><i class="fa-solid fa-cloud-arrow-up" style="font-size:4rem; color:white;"></i></div>`;
    }

    // Header Butonları
    let actionButtons = `
        <button class="play-all-btn" id="list-play-btn"><i class="fa-solid fa-play"></i></button>
        <button id="list-shuffle-btn" style="background:rgba(255,255,255,0.1); border:none; color:#fff; font-size:1.2rem; width:50px; height:50px; border-radius:50%; cursor:pointer;"><i class="fa-solid fa-shuffle"></i></button>
    `;

    if (listType === 'userPlaylist') {
        actionButtons += `
            <button onclick="openEditModal('${title}')" style="background:rgba(255,255,255,0.1); border:none; color:#fff; font-size:1.1rem; width:50px; height:50px; border-radius:50%; cursor:pointer;" title="Düzenle">
                <i class="fa-solid fa-pen"></i>
            </button>
            <button onclick="deletePlaylist('${title}')" style="background:rgba(231, 76, 60, 0.2); border:none; color:#e74c3c; font-size:1.1rem; width:50px; height:50px; border-radius:50%; cursor:pointer;" title="Sil">
                <i class="fa-solid fa-trash"></i>
            </button>
        `;
    }

    // Ana İskelet HTML'i
    let html = `
        <div style="padding-bottom: 100px;">
            <div class="playlist-view-header">
                <div class="playlist-cover-art">${coverHTML}</div>
                <div>
                    <h4 style="font-size:0.8rem; letter-spacing:2px; color:#aaa; margin-bottom:5px;">LİSTE</h4>
                    <h1 style="font-size:1.8rem; font-weight:700; margin:0; line-height:1.2;">${title}</h1>
                    <div style="color:#ccc; margin-top:5px; font-size:0.9rem;">${songs.length} Şarkı</div>
                </div>
            </div>

            <div class="playlist-actions">
                ${actionButtons}
            </div>

            <div id="dynamic-song-container"></div>
        </div>
    `;

    mainView.innerHTML = html;

    // 2. İÇERİK OLUŞTURMA (PC vs MOBİL KARARI)
    const container = document.getElementById('dynamic-song-container');
    const isDesktop = window.innerWidth > 768; // Bilgisayar mı?

    if (songs.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding:30px; color:#666;">Bu listede henüz şarkı yok.</div>';
    } else {
        
        if (isDesktop) {
            // --- BİLGİSAYAR GÖRÜNÜMÜ (TABLO) ---
            let tableHTML = `
                <table class="song-list-table">
                    <thead>
                        <tr>
                            <th width="40">#</th>
                            <th>Başlık</th>
                            <th>Sanatçı</th>
                            <th width="100" style="text-align:center;">İşlemler</th>
                        </tr>
                    </thead>
                    <tbody>
            `;

            songs.forEach((song, idx) => {
                // Silme butonu mantığı
                let deleteAction = '';
                if(listType === 'uploads') deleteAction = `deleteSongFromDB(${song.id})`;
                else if(listType === 'userPlaylist') deleteAction = `removeSongFromPlaylist('${title}', ${song.id})`;

                let delBtn = deleteAction ? `<button onclick="event.stopPropagation(); ${deleteAction}" class="action-btn btn-delete"><i class="fa-solid fa-trash"></i></button>` : '';
                let addBtn = listType === 'uploads' ? `<button onclick="event.stopPropagation(); addSongToPlaylistModalFromSheet('${song.id}')" class="action-btn btn-add"><i class="fa-solid fa-plus"></i></button>` : '';

                tableHTML += `
                    <tr class="song-row" onclick="currentPlaylist=[...allSongs]; currentIndex=${idx}; loadSong(allSongs.find(s=>s.id==${song.id})); safePlay();">
                        <td>${idx + 1}</td>
                        <td class="song-title-cell">
                            <img src="${song.cover || 'https://via.placeholder.com/150'}" onerror="this.src='https://via.placeholder.com/150'">
                            ${song.name}
                        </td>
                        <td>${song.artist}</td>
                        <td style="text-align:center;">
                            ${addBtn} ${delBtn}
                        </td>
                    </tr>
                `;
            });

            tableHTML += `</tbody></table>`;
            container.innerHTML = tableHTML;

        } else {
            // --- MOBİL GÖRÜNÜM (KART LİSTESİ) ---
            let listHTML = `<div class="song-list-table">`; // Class ismi aynı kalsın stil bozulmasın

            songs.forEach((song, idx) => {
                const safeSong = encodeURIComponent(JSON.stringify(song));
                
                listHTML += `
                    <div class="song-row" onclick="if(!event.target.closest('.more-options-btn')){ currentPlaylist=[...allSongs]; currentIndex=${idx}; loadSong(allSongs.find(s=>s.id==${song.id})); safePlay(); }">
                        <div class="song-title-cell">
                            <img src="${song.cover || 'https://via.placeholder.com/150'}" onerror="this.src='https://via.placeholder.com/150'">
                            <div class="mobile-song-details">
                                <div class="mobile-song-title">${song.name}</div>
                                <div class="mobile-song-artist">${song.artist}</div>
                            </div>
                        </div>
                        
                        <button class="more-options-btn" onclick="openMobileActionSheet('${safeSong}', '${listType}', '${title}')" 
                                style="background:none; border:none; color:#aaa; padding:10px;">
                            <i class="fa-solid fa-ellipsis-vertical" style="font-size:1.2rem;"></i>
                        </button>
                    </div>
                `;
            });

            listHTML += `</div>`;
            container.innerHTML = listHTML;
        }
    }

    // Ana Oynatma Butonları İşlevi
    document.getElementById('list-play-btn').onclick = () => { if(songs.length){ currentPlaylist=[...songs]; currentIndex=0; loadSong(songs[0]); safePlay(); } };
    document.getElementById('list-shuffle-btn').onclick = () => { if(songs.length){ currentPlaylist=[...songs].sort(()=>Math.random()-0.5); currentIndex=0; loadSong(currentPlaylist[0]); safePlay(); } };
}

// Pencere boyutu değişirse sayfayı yenile (Görünüm düzelsin diye)
window.addEventListener('resize', () => {
    // Sadece yatay genişlik kritik eşiği geçerse yenile
    if (document.querySelector('.playlist-view-header')) { // Eğer liste sayfasındaysak
        const isNowDesktop = window.innerWidth > 768;
        // Basit bir debounce ile sürekli yenilemeyi engelle
        clearTimeout(window.resizeTimer);
        window.resizeTimer = setTimeout(() => {
             // Sadece playlist sayfasındaysak render'ı tekrar çağır (Aktif menüye göre)
             const activeItem = document.querySelector('.mobile-bottom-nav .nav-item.active');
             if(activeItem && activeItem.id === 'nav-library') {
                 document.getElementById('nav-library').click(); 
             }
        }, 500);
    }
});

/* =========================================
   ACTION SHEET SİSTEMİ (POP-UP MENÜ) 🚀
   ========================================= */

// Action Sheet HTML'ini Sayfaya Bir Kere Enjekte Et
document.addEventListener('DOMContentLoaded', () => {
    if (!document.getElementById('mobile-action-sheet-overlay')) {
        const sheetHTML = `
            <div id="mobile-action-sheet-overlay" class="mobile-action-sheet-overlay" onclick="closeMobileActionSheet()">
                <div class="mobile-action-sheet" onclick="event.stopPropagation()"> <div id="sheet-content"></div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', sheetHTML);
    }
});

function openMobileActionSheet(encodedSong, listType, playlistName) {
    const song = JSON.parse(decodeURIComponent(encodedSong));
    const sheetOverlay = document.getElementById('mobile-action-sheet-overlay');
    const sheetContent = document.getElementById('sheet-content');
    
    let actionsHTML = '';

    // 1. "Listeye Ekle" Butonu (Her yerde çıksın)
    actionsHTML += `
        <button class="sheet-action" onclick="closeMobileActionSheet(); addSongToPlaylistModalFromSheet('${song.id}')">
            <i class="fa-solid fa-plus"></i> Çalma Listesine Ekle
        </button>
    `;

    // 2. "Sil" Butonu (Sadece Uploads veya Kullanıcı Listesinde çıksın)
    if (listType === 'uploads') {
        actionsHTML += `
            <button class="sheet-action danger" onclick="closeMobileActionSheet(); deleteSongFromDB(${song.id})">
                <i class="fa-solid fa-trash"></i> Kütüphaneden Sil
            </button>
        `;
    } else if (listType === 'userPlaylist') {
        // Playlistten silme fonksiyonu için playlist ismini gönderiyoruz
        actionsHTML += `
            <button class="sheet-action danger" onclick="closeMobileActionSheet(); removeSongFromPlaylist('${playlistName}', ${song.id})">
                <i class="fa-solid fa-circle-minus"></i> Listeden Çıkar
            </button>
        `;
    }

    // Sheet İçeriğini Doldur
    sheetContent.innerHTML = `
        <div class="sheet-header">
            <img src="${song.cover}" class="sheet-img">
            <div class="sheet-info">
                <h3>${song.name}</h3>
                <p>${song.artist}</p>
            </div>
        </div>
        <div class="sheet-actions-list">
            ${actionsHTML}
        </div>
    `;

    // Göster
    sheetOverlay.classList.add('active');
}

function closeMobileActionSheet() {
    const sheetOverlay = document.getElementById('mobile-action-sheet-overlay');
    if(sheetOverlay) sheetOverlay.classList.remove('active');
}

// Yardımcı: Sheet içinden playlist modalını çağırmak için
// (Normal addSongToPlaylistModal fonksiyonuna song objesi yollamak yerine ID ile buluyoruz)
function addSongToPlaylistModalFromSheet(songId) {
    const song = allSongs.find(s => s.id == songId);
    if(song) {
        addSongToPlaylistModal(song);
    }
}
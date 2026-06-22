document.addEventListener('DOMContentLoaded', () => {

    // ============================================================
    // CONFIGURATION
    // ============================================================
    const ADMIN_PASSWORD = "CSB";
    const BASE = "./assets/photos/galerie";

    // Correspondance clé de section -> nom réel du dossier sur le disque.
    // (Les dossiers gardent leur nom d'origine : espace et pluriel inclus.)
    const SECTION_FOLDERS = {
        club: "le club",
        competitions: "competitions",
        entrainement: "entrainements"
    };

    // Libellés affichés pour les onglets des sections "plates".
    const SECTION_LABELS = {
        club: "Le Club",
        competitions: "Compétitions",
        entrainement: "Entraînement",
        stages: "Stages"
    };

    // Modèle de données vide (sécurité si le JSON est absent ou corrompu).
    let galleryData = { sections: { club: [], competitions: [], entrainement: [], stages: [] } };

    // ============================================================
    // SÉLECTION DES ÉLÉMENTS DU DOM
    // ============================================================
    // Public
    const tabsContainer = document.getElementById('gallery-tabs');
    const galleryContent = document.getElementById('gallery-content');

    // Lightbox
    const lightbox = document.getElementById('lightbox');
    const lightboxImg = document.getElementById('lightbox-img');
    const lightboxCaption = document.getElementById('lightbox-caption');
    const btnLbClose = document.getElementById('lightbox-close');
    const btnLbPrev = document.getElementById('lightbox-prev');
    const btnLbNext = document.getElementById('lightbox-next');

    // Admin - connexion
    const btnOpenLogin = document.getElementById('btn-open-login');
    const modalLogin = document.getElementById('modal-login');
    const btnCloseLogin = document.getElementById('btn-close-login');
    const btnLogin = document.getElementById('btn-login');
    const inputPassword = document.getElementById('admin-password');
    const loginError = document.getElementById('login-error');

    // Admin - dashboard
    const modalAdmin = document.getElementById('modal-admin');
    const btnCloseAdmin = document.getElementById('btn-close-admin');
    const btnExport = document.getElementById('btn-export');

    // Admin - gestion des photos
    const selectSection = document.getElementById('admin-section-select');
    const stageWrapper = document.getElementById('admin-stage-wrapper');
    const selectStage = document.getElementById('admin-stage-select');
    const inputPhoto = document.getElementById('admin-photo-filename');
    const btnAddPhoto = document.getElementById('btn-add-photo');
    const adminPhotoList = document.getElementById('admin-photo-list');

    // Admin - gestion des stages
    const inputStageDossier = document.getElementById('admin-stage-dossier');
    const inputStageNom = document.getElementById('admin-stage-nom');
    const btnAddStage = document.getElementById('btn-add-stage');
    const adminStageList = document.getElementById('admin-stage-list');

    // État courant
    let activeSection = 'club';   // onglet public affiché
    let lightboxGroup = [];       // liste {src, caption} en cours dans la lightbox
    let lightboxIndex = 0;

    // ============================================================
    // CHARGEMENT DES DONNÉES
    // ============================================================
    Store.loadCollection('galerie')
        .then(data => {
            if (data && data.sections) galleryData = data;
            renderTabs();
            renderSection(activeSection);
        })
        .catch(error => {
            console.error(error);
            if (galleryContent) {
                galleryContent.innerHTML = '<p class="text-gray-500 font-sans col-span-full text-center">La galerie est momentanément indisponible.</p>';
            }
        });

    // ============================================================
    // OUTILS
    // ============================================================
    // Construit le chemin d'une photo (gère l'espace de "le club" via encodeURI).
    function photoSrc(section, filename, stageDossier) {
        const path = (section === 'stages')
            ? `${BASE}/stages/${stageDossier}/${filename}`
            : `${BASE}/${SECTION_FOLDERS[section]}/${filename}`;
        return encodeURI(path);
    }

    // Transforme un nom de dossier en titre lisible : "Stage_2012_Baby" -> "Stage 2012 Baby".
    function prettifyStageName(dossier) {
        return dossier
            .replace(/_/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .replace(/\bself defense\b/i, 'Self-Défense Féminine')
            .replace(/\b\w/g, c => c.toUpperCase());
    }

    // ============================================================
    // RENDU PUBLIC
    // ============================================================
    function renderTabs() {
        if (!tabsContainer) return;
        const order = ['club', 'competitions', 'entrainement', 'stages'];
        tabsContainer.innerHTML = order.map(key => `
            <button type="button" data-section="${key}"
                class="gallery-tab px-5 py-2 font-condensed uppercase tracking-wider text-sm rounded-full border border-csb-tatami transition whitespace-nowrap">
                ${SECTION_LABELS[key]}
            </button>
        `).join('');

        tabsContainer.querySelectorAll('.gallery-tab').forEach(btn => {
            btn.addEventListener('click', () => {
                activeSection = btn.dataset.section;
                renderSection(activeSection);
                highlightTab();
            });
        });
        highlightTab();
    }

    function highlightTab() {
        if (!tabsContainer) return;
        tabsContainer.querySelectorAll('.gallery-tab').forEach(btn => {
            const on = btn.dataset.section === activeSection;
            btn.classList.toggle('bg-csb-dojo', on);
            btn.classList.toggle('text-white', on);
            btn.classList.toggle('border-csb-dojo', on);
            btn.classList.toggle('bg-white', !on);
            btn.classList.toggle('text-csb-encre', !on);
        });
    }

    // Construit une tuile photo cliquable (ouvre la lightbox).
    function tileHTML(src, caption, groupId, index) {
        return `
            <button type="button" class="gallery-tile group block aspect-square overflow-hidden rounded-xl bg-csb-tatami border border-csb-tatami hover:border-csb-corail transition"
                    data-group="${groupId}" data-index="${index}">
                <img src="${src}" alt="${caption}" loading="lazy"
                     class="w-full h-full object-cover group-hover:scale-105 transition duration-500"
                     onerror="this.parentElement.classList.add('hidden')">
            </button>`;
    }

    // Message d'état vide réutilisable.
    function emptyState(message) {
        return `<p class="text-gray-500 font-sans col-span-full text-center py-16">${message}</p>`;
    }

    function renderSection(section) {
        if (!galleryContent) return;
        lightboxGroup = []; // sera reconstruit au clic via les groupes ci-dessous

        // --- Sections plates (club / compétitions / entraînement) ---
        if (section !== 'stages') {
            const photos = galleryData.sections[section] || [];
            if (photos.length === 0) {
                galleryContent.innerHTML = emptyState("Aucune photo dans cette section pour le moment.");
                bindTiles([]);
                return;
            }
            const group = photos.map(f => ({ src: photoSrc(section, f), caption: SECTION_LABELS[section] }));
            galleryContent.innerHTML = `
                <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    ${photos.map((f, i) => tileHTML(photoSrc(section, f), SECTION_LABELS[section], 0, i)).join('')}
                </div>`;
            bindTiles([group]);
            return;
        }

        // --- Section Stages : un groupe distinct par stage, jamais mélangé ---
        const stages = galleryData.sections.stages || [];
        if (stages.length === 0) {
            galleryContent.innerHTML = emptyState("Aucun stage enregistré pour le moment.");
            bindTiles([]);
            return;
        }

        const groups = [];
        const blocks = stages.map((stage, gIndex) => {
            const group = (stage.photos || []).map(f => ({
                src: photoSrc('stages', f, stage.dossier),
                caption: stage.nom
            }));
            groups.push(group);
            const tiles = (stage.photos || [])
                .map((f, i) => tileHTML(photoSrc('stages', f, stage.dossier), stage.nom, gIndex, i))
                .join('');
            return `
                <div class="mb-12">
                    <div class="flex items-center gap-4 mb-5">
                        <h3 class="font-condensed text-2xl uppercase tracking-wider text-csb-encre">${stage.nom}</h3>
                        <span class="font-sans text-xs text-gray-400">${(stage.photos || []).length} photo(s)</span>
                        <span class="flex-grow h-px bg-csb-tatami"></span>
                    </div>
                    <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        ${tiles || emptyState("Stage sans photo.")}
                    </div>
                </div>`;
        }).join('');

        galleryContent.innerHTML = blocks;
        bindTiles(groups);
    }

    // Attache l'ouverture de la lightbox sur chaque tuile.
    function bindTiles(groups) {
        galleryContent.querySelectorAll('.gallery-tile').forEach(tile => {
            tile.addEventListener('click', () => {
                const g = parseInt(tile.dataset.group);
                const i = parseInt(tile.dataset.index);
                openLightbox(groups[g], i);
            });
        });
    }

    // ============================================================
    // LIGHTBOX
    // ============================================================
    function openLightbox(group, index) {
        if (!group || group.length === 0) return;
        lightboxGroup = group;
        lightboxIndex = index;
        updateLightbox();
        lightbox.classList.remove('hidden');
        setTimeout(() => lightbox.classList.remove('opacity-0'), 10);
    }

    function updateLightbox() {
        const item = lightboxGroup[lightboxIndex];
        if (!item) return;
        lightboxImg.src = item.src;
        lightboxCaption.textContent = `${item.caption} — ${lightboxIndex + 1} / ${lightboxGroup.length}`;
    }

    function closeLightbox() {
        lightbox.classList.add('opacity-0');
        setTimeout(() => lightbox.classList.add('hidden'), 300);
    }

    function navLightbox(step) {
        if (lightboxGroup.length === 0) return;
        lightboxIndex = (lightboxIndex + step + lightboxGroup.length) % lightboxGroup.length;
        updateLightbox();
    }

    if (lightbox) {
        btnLbClose.addEventListener('click', closeLightbox);
        btnLbPrev.addEventListener('click', () => navLightbox(-1));
        btnLbNext.addEventListener('click', () => navLightbox(1));
        // Clic sur le fond (hors image/boutons) ferme la lightbox.
        lightbox.addEventListener('click', (e) => { if (e.target === lightbox) closeLightbox(); });
        // Navigation clavier
        document.addEventListener('keydown', (e) => {
            if (lightbox.classList.contains('hidden')) return;
            if (e.key === 'Escape') closeLightbox();
            if (e.key === 'ArrowLeft') navLightbox(-1);
            if (e.key === 'ArrowRight') navLightbox(1);
        });
    }

    // ============================================================
    // ADMIN — Connexion
    // ============================================================
    if (btnOpenLogin) {
        btnOpenLogin.addEventListener('click', () => {
            modalLogin.classList.remove('hidden');
            setTimeout(() => modalLogin.classList.remove('opacity-0'), 10);
        });
    }
    if (btnCloseLogin) {
        btnCloseLogin.addEventListener('click', () => {
            modalLogin.classList.add('opacity-0');
            setTimeout(() => modalLogin.classList.add('hidden'), 300);
        });
    }
    if (btnLogin) {
        btnLogin.addEventListener('click', () => {
            if (inputPassword.value === ADMIN_PASSWORD) {
                inputPassword.value = '';
                loginError.classList.add('hidden');
                modalLogin.classList.add('hidden', 'opacity-0');
                modalAdmin.classList.remove('hidden');
                setTimeout(() => modalAdmin.classList.remove('opacity-0'), 10);
                refreshAdmin();
            } else {
                loginError.classList.remove('hidden');
            }
        });
    }
    if (btnCloseAdmin) {
        btnCloseAdmin.addEventListener('click', () => {
            modalAdmin.classList.add('opacity-0');
            setTimeout(() => modalAdmin.classList.add('hidden'), 300);
            // Rafraîchit l'affichage public avec les éventuelles modifications.
            renderTabs();
            renderSection(activeSection);
        });
    }

    // ============================================================
    // ADMIN — Gestion des photos
    // ============================================================
    // (Ré)initialise le sélecteur de stage selon les données.
    function refreshStageOptions() {
        if (!selectStage) return;
        selectStage.innerHTML = (galleryData.sections.stages || [])
            .map((s, i) => `<option value="${i}">${s.nom}</option>`).join('');
    }

    // Affiche/masque le sélecteur de stage selon la section choisie.
    function onSectionChange() {
        const isStages = selectSection.value === 'stages';
        stageWrapper.classList.toggle('hidden', !isStages);
        renderAdminPhotoList();
    }

    // Renvoie le tableau de photos actuellement ciblé par le formulaire admin.
    function currentPhotoArray() {
        const section = selectSection.value;
        if (section === 'stages') {
            const stage = galleryData.sections.stages[parseInt(selectStage.value)];
            return stage ? stage.photos : null;
        }
        return galleryData.sections[section];
    }

    function renderAdminPhotoList() {
        if (!adminPhotoList) return;
        const arr = currentPhotoArray();
        if (!arr || arr.length === 0) {
            adminPhotoList.innerHTML = '<p class="text-sm text-gray-400">Aucune photo.</p>';
            return;
        }
        adminPhotoList.innerHTML = arr.map((f, i) => `
            <div class="flex justify-between items-center gap-3 bg-white border border-csb-tatami rounded px-3 py-2">
                <span class="text-sm text-csb-dojo truncate" title="${f}">${f}</span>
                <button type="button" class="btn-del-photo px-2 py-1 bg-red-100 text-csb-corail rounded hover:bg-csb-corail hover:text-white transition text-xs" data-index="${i}">Suppr.</button>
            </div>`).join('');

        adminPhotoList.querySelectorAll('.btn-del-photo').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const i = parseInt(e.target.dataset.index);
                const target = currentPhotoArray();
                if (target) { target.splice(i, 1); renderAdminPhotoList(); }
            });
        });
    }

    if (btnAddPhoto) {
        btnAddPhoto.addEventListener('click', () => {
            const filename = inputPhoto.value.trim();
            if (!filename) { alert("Indiquez le nom du fichier (ex: photo.jpg)."); return; }
            const arr = currentPhotoArray();
            if (!arr) { alert("Sélectionnez d'abord un stage."); return; }
            arr.push(filename);
            inputPhoto.value = '';
            renderAdminPhotoList();
        });
    }
    if (selectSection) selectSection.addEventListener('change', onSectionChange);
    if (selectStage) selectStage.addEventListener('change', renderAdminPhotoList);

    // ============================================================
    // ADMIN — Gestion des stages
    // ============================================================
    // Auto-remplit le titre lisible quand on saisit le nom du dossier.
    if (inputStageDossier) {
        inputStageDossier.addEventListener('input', () => {
            inputStageNom.value = inputStageDossier.value.trim()
                ? prettifyStageName(inputStageDossier.value.trim())
                : '';
        });
    }

    function renderAdminStageList() {
        if (!adminStageList) return;
        const stages = galleryData.sections.stages || [];
        if (stages.length === 0) {
            adminStageList.innerHTML = '<p class="text-sm text-gray-400">Aucun stage.</p>';
            return;
        }
        adminStageList.innerHTML = stages.map((s, i) => `
            <div class="flex justify-between items-center gap-3 bg-white border border-csb-tatami rounded px-3 py-2">
                <div class="truncate">
                    <span class="text-sm font-bold text-csb-dojo">${s.nom}</span>
                    <span class="block text-[10px] text-gray-400">${s.dossier} · ${(s.photos || []).length} photo(s)</span>
                </div>
                <button type="button" class="btn-del-stage px-2 py-1 bg-red-100 text-csb-corail rounded hover:bg-csb-corail hover:text-white transition text-xs" data-index="${i}">Suppr.</button>
            </div>`).join('');

        adminStageList.querySelectorAll('.btn-del-stage').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const i = parseInt(e.target.dataset.index);
                if (confirm("Supprimer ce stage et toutes ses photos de la galerie ?")) {
                    galleryData.sections.stages.splice(i, 1);
                    refreshStageOptions();
                    onSectionChange();
                    renderAdminStageList();
                }
            });
        });
    }

    if (btnAddStage) {
        btnAddStage.addEventListener('click', () => {
            const dossier = inputStageDossier.value.trim();
            const nom = inputStageNom.value.trim() || prettifyStageName(dossier);
            if (!dossier) { alert("Indiquez le nom du dossier du stage (ex: stage-noel-2025)."); return; }
            galleryData.sections.stages.unshift({ nom, dossier, photos: [] });
            inputStageDossier.value = '';
            inputStageNom.value = '';
            refreshStageOptions();
            renderAdminStageList();
            // Bascule le formulaire photo sur Stages pour enchaîner l'ajout d'images.
            selectSection.value = 'stages';
            selectStage.value = '0';
            onSectionChange();
        });
    }

    // Rafraîchit tout le panneau admin (appelé à l'ouverture).
    function refreshAdmin() {
        refreshStageOptions();
        onSectionChange();
        renderAdminStageList();
    }

    // ============================================================
    // ADMIN — Export du JSON
    // ============================================================
    if (btnExport) {
        btnExport.addEventListener('click', () => {
            // L'export passe désormais par la couche d'accès aux données (store.js).
            Store.saveCollection('galerie', galleryData);
        });
    }
});

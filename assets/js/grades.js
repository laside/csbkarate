document.addEventListener('DOMContentLoaded', () => {

    // ============================================================
    // CONFIGURATION
    // ============================================================
    // Modèle vide (sécurité si le JSON est absent ou corrompu).
    let gradesData = { grades: [] };

    // ============================================================
    // SÉLECTION DES ÉLÉMENTS DU DOM
    // ============================================================
    // Public
    const kyuGrid = document.getElementById('kyu-grid');
    const danGrid = document.getElementById('dan-grid');

    // Admin — dashboard (login/modales gérés par admin.js)
    const modalAdmin = document.getElementById('modal-admin'); // utilisé pour le scroll du formulaire
    const btnExport = document.getElementById('btn-export');
    const adminGradeList = document.getElementById('admin-grade-list');

    // Admin — formulaire
    const formTitle = document.getElementById('form-title');
    const inputId = document.getElementById('grade-id');
    const inputType = document.getElementById('grade-type');
    const inputName = document.getElementById('grade-name');
    const inputCeinture = document.getElementById('grade-ceinture');
    const inputColor = document.getElementById('grade-color');
    const inputKatas = document.getElementById('grade-katas');
    const kyuFields = document.getElementById('kyu-fields');
    const danFields = document.getElementById('dan-fields');
    const inputKihon = document.getElementById('grade-kihon');
    const inputSanbon = document.getElementById('grade-sanbon');
    const inputOhyo = document.getElementById('grade-ohyo');
    const inputAge = document.getElementById('grade-age');
    const inputTemps = document.getElementById('grade-temps');
    const inputLicences = document.getElementById('grade-licences');
    const btnSaveGrade = document.getElementById('btn-save-grade');
    const btnCancelEdit = document.getElementById('btn-cancel-edit');

    // ============================================================
    // OUTILS
    // ============================================================
    // Texte multi-lignes -> tableau (1 entrée par ligne non vide).
    const textToList = (value) => value.split('\n').map(s => s.trim()).filter(Boolean);
    // Tableau -> texte multi-lignes.
    const listToText = (arr) => (arr || []).join('\n');
    // Échappe le HTML pour injecter du contenu utilisateur en toute sécurité.
    const esc = (str) => String(str ?? '').replace(/[&<>"']/g, c =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    // Pastille couleur réelle de la ceinture (le seul élément hors charte, piloté par les données).
    function beltSwatch(hex) {
        return `<span class="block w-9 h-9 rounded-lg border border-black/15 shadow-inner shrink-0" style="background:${esc(hex)}"></span>`;
    }

    // Bloc technique « titre + liste » réutilisable. emptyText affiché si la liste est vide.
    function techBlock(title, arr, emptyText) {
        const items = arr || [];
        let body;
        if (items.length === 0) {
            if (!emptyText) return '';
            body = `<p class="text-sm text-gray-400 italic">${esc(emptyText)}</p>`;
        } else {
            body = `<ul class="space-y-1">${items.map(i =>
                `<li class="flex items-baseline gap-2 text-sm text-gray-700"><span class="text-csb-corail leading-none">▸</span><span>${esc(i)}</span></li>`
            ).join('')}</ul>`;
        }
        return `
            <div class="mt-4 first:mt-0">
                <p class="font-condensed uppercase tracking-widest text-[11px] text-csb-encre/70 mb-1">${esc(title)}</p>
                ${body}
            </div>`;
    }

    // ============================================================
    // CHARGEMENT DES DONNÉES
    // ============================================================
    Store.loadCollection('grades')
        .then(data => {
            if (data && Array.isArray(data.grades)) gradesData = data;
            renderPublic();
        })
        .catch(error => {
            console.error(error);
            const msg = '<p class="text-gray-500 font-sans col-span-full text-center py-10">Le programme des grades est momentanément indisponible.</p>';
            if (kyuGrid) kyuGrid.innerHTML = msg;
            if (danGrid) danGrid.innerHTML = '';
        });

    // ============================================================
    // RENDU PUBLIC
    // ============================================================
    function renderPublic() {
        renderKyu();
        renderDan();
    }

    function renderKyu() {
        if (!kyuGrid) return;
        const list = gradesData.grades.filter(g => g.type === 'kyu' && !g.hidden);
        if (list.length === 0) {
            kyuGrid.innerHTML = '<p class="text-gray-500 font-sans col-span-full text-center py-10">Aucun grade Kyu publié.</p>';
            return;
        }
        kyuGrid.innerHTML = list.map(g => `
            <article class="bento-card flex flex-col group" style="border-left:6px solid ${esc(g.couleurHex)}">
                <header class="flex items-center gap-3 mb-4 pb-4 border-b border-csb-tatami">
                    ${beltSwatch(g.couleurHex)}
                    <div>
                        <h3 class="font-condensed text-2xl uppercase tracking-wider text-csb-encre leading-none group-hover:text-csb-corail transition">${esc(g.grade)}</h3>
                        <span class="font-condensed uppercase tracking-widest text-[11px] text-gray-400">Ceinture ${esc(g.ceinture)}</span>
                    </div>
                </header>
                ${techBlock('Katas à maîtriser', g.katas)}
                ${techBlock('Kihon Ippon Kumite', g.kihonIpponKumite)}
                ${techBlock('Sanbon Kumite', g.sanbonKumite)}
                ${techBlock('Ohyo Kumite', g.ohyoKumite, 'Non requis à ce grade')}
            </article>
        `).join('');
    }

    function renderDan() {
        if (!danGrid) return;
        const list = gradesData.grades.filter(g => g.type === 'dan' && !g.hidden);
        if (list.length === 0) {
            danGrid.innerHTML = '<p class="text-gray-400 font-sans col-span-full text-center py-10">Aucun grade Dan publié.</p>';
            return;
        }
        danGrid.innerHTML = list.map(g => `
            <article class="bento-card flex flex-col group bg-white" style="border-left:6px solid ${esc(g.couleurHex)}">
                <header class="flex items-center gap-3 mb-4 pb-4 border-b border-csb-tatami">
                    ${beltSwatch(g.couleurHex)}
                    <div>
                        <h3 class="font-condensed text-2xl uppercase tracking-wider text-csb-encre leading-none group-hover:text-csb-corail transition">${esc(g.grade)}</h3>
                        <span class="font-condensed uppercase tracking-widest text-[11px] text-gray-400">Ceinture ${esc(g.ceinture)}</span>
                    </div>
                </header>
                <dl class="grid grid-cols-1 gap-2 mb-4 text-sm">
                    <div class="flex justify-between gap-3 border-b border-csb-tatami/60 pb-1">
                        <dt class="font-condensed uppercase tracking-wider text-[11px] text-csb-encre/70 pt-0.5">Âge minimum</dt>
                        <dd class="text-csb-encre font-semibold text-right">${esc(g.ageMinimum)}</dd>
                    </div>
                    <div class="flex justify-between gap-3 border-b border-csb-tatami/60 pb-1">
                        <dt class="font-condensed uppercase tracking-wider text-[11px] text-csb-encre/70 pt-0.5">Temps d'attente</dt>
                        <dd class="text-gray-600 text-right">${esc(g.tempsAttente)}</dd>
                    </div>
                    <div class="flex justify-between gap-3">
                        <dt class="font-condensed uppercase tracking-wider text-[11px] text-csb-encre/70 pt-0.5">Licences</dt>
                        <dd class="text-gray-600 text-right">${esc(g.licences)}</dd>
                    </div>
                </dl>
                ${techBlock('Katas du programme (Annexe V)', g.katas)}
            </article>
        `).join('');
    }

    // ============================================================
    // ADMIN — Connexion
    // ============================================================
    // Mode admin : connexion + dashboard (logique factorisée dans admin.js).
    Admin.init({
        onUnlock: () => { resetForm(); renderAdminList(); },
        onCloseAdmin: renderPublic
    });

    // ============================================================
    // ADMIN — Formulaire (champs adaptés au type Kyu / Dan)
    // ============================================================
    // Affiche les champs propres au type sélectionné.
    function syncFormFields() {
        const isDan = inputType.value === 'dan';
        kyuFields.classList.toggle('hidden', isDan);
        danFields.classList.toggle('hidden', !isDan);
    }
    if (inputType) inputType.addEventListener('change', syncFormFields);

    function resetForm() {
        formTitle.textContent = "Ajouter un grade";
        formTitle.classList.remove('text-csb-dojo');
        formTitle.classList.add('text-csb-corail');
        inputId.value = '';
        inputType.value = 'kyu';
        inputName.value = '';
        inputCeinture.value = '';
        inputColor.value = '#E63946';
        inputKatas.value = '';
        inputKihon.value = '';
        inputSanbon.value = '';
        inputOhyo.value = '';
        inputAge.value = '';
        inputTemps.value = '';
        inputLicences.value = '';
        btnCancelEdit.classList.add('hidden');
        syncFormFields();
    }

    function loadGradeIntoForm(id) {
        const g = gradesData.grades.find(x => x.id === id);
        if (!g) return;

        formTitle.textContent = "Modifier le grade";
        formTitle.classList.remove('text-csb-corail');
        formTitle.classList.add('text-csb-dojo');

        inputId.value = g.id;
        inputType.value = g.type;
        inputName.value = g.grade || '';
        inputCeinture.value = g.ceinture || '';
        inputColor.value = g.couleurHex || '#E63946';
        inputKatas.value = listToText(g.katas);
        inputKihon.value = listToText(g.kihonIpponKumite);
        inputSanbon.value = listToText(g.sanbonKumite);
        inputOhyo.value = listToText(g.ohyoKumite);
        inputAge.value = g.ageMinimum || '';
        inputTemps.value = g.tempsAttente || '';
        inputLicences.value = g.licences || '';

        btnCancelEdit.classList.remove('hidden');
        syncFormFields();
        modalAdmin.scrollTo({ top: 0, behavior: 'smooth' });
    }

    if (btnCancelEdit) btnCancelEdit.addEventListener('click', resetForm);

    if (btnSaveGrade) {
        btnSaveGrade.addEventListener('click', () => {
            if (!inputName.value.trim() || !inputCeinture.value.trim()) {
                alert("Indiquez au moins le nom du grade et la couleur de ceinture.");
                return;
            }

            const isEdit = !!inputId.value;
            // Conserve l'état "masqué" lors d'une édition.
            const existing = isEdit ? gradesData.grades.find(x => x.id === parseInt(inputId.value)) : null;

            const grade = {
                id: isEdit ? parseInt(inputId.value) : Date.now(),
                type: inputType.value,
                grade: inputName.value.trim(),
                ceinture: inputCeinture.value.trim(),
                couleurHex: inputColor.value,
                hidden: existing ? !!existing.hidden : false,
                katas: textToList(inputKatas.value)
            };

            if (inputType.value === 'kyu') {
                grade.kihonIpponKumite = textToList(inputKihon.value);
                grade.sanbonKumite = textToList(inputSanbon.value);
                grade.ohyoKumite = textToList(inputOhyo.value);
            } else {
                grade.ageMinimum = inputAge.value.trim();
                grade.tempsAttente = inputTemps.value.trim();
                grade.licences = inputLicences.value.trim();
            }

            if (isEdit) {
                const index = gradesData.grades.findIndex(x => x.id === parseInt(inputId.value));
                if (index !== -1) gradesData.grades[index] = grade;
            } else {
                gradesData.grades.push(grade);
            }

            resetForm();
            renderAdminList();
        });
    }

    // ============================================================
    // ADMIN — Liste des grades (éditer / masquer / supprimer)
    // ============================================================
    function renderAdminList() {
        if (!adminGradeList) return;
        if (gradesData.grades.length === 0) {
            adminGradeList.innerHTML = '<p class="text-sm text-gray-400">Aucun grade.</p>';
            return;
        }
        adminGradeList.innerHTML = gradesData.grades.map(g => `
            <div class="bg-white p-4 rounded-xl border border-csb-tatami flex justify-between items-center gap-4 ${g.hidden ? 'opacity-50' : ''}">
                <div class="flex items-center gap-3 flex-grow min-w-0">
                    <span class="block w-6 h-6 rounded border border-black/15 shrink-0" style="background:${esc(g.couleurHex)}"></span>
                    <div class="min-w-0">
                        <span class="text-[10px] font-bold uppercase tracking-wider text-gray-400">${g.type === 'dan' ? 'Dan' : 'Kyu'}${g.hidden ? ' · masqué' : ''}</span>
                        <h4 class="font-bold text-csb-dojo truncate">${esc(g.grade)} <span class="font-normal text-gray-400 text-sm">— ${esc(g.ceinture)}</span></h4>
                    </div>
                </div>
                <div class="flex gap-2 shrink-0">
                    <button class="btn-edit px-3 py-1 bg-gray-100 text-gray-600 rounded hover:bg-csb-dojo hover:text-white transition text-sm" data-id="${g.id}">Éditer</button>
                    <button class="btn-toggle px-3 py-1 bg-gray-100 text-gray-600 rounded hover:bg-csb-dojo hover:text-white transition text-sm" data-id="${g.id}">${g.hidden ? 'Afficher' : 'Masquer'}</button>
                    <button class="btn-delete px-3 py-1 bg-red-100 text-csb-corail rounded hover:bg-csb-corail hover:text-white transition text-sm" data-id="${g.id}">Suppr.</button>
                </div>
            </div>
        `).join('');

        adminGradeList.querySelectorAll('.btn-edit').forEach(btn =>
            btn.addEventListener('click', (e) => loadGradeIntoForm(parseInt(e.currentTarget.dataset.id))));
        adminGradeList.querySelectorAll('.btn-toggle').forEach(btn =>
            btn.addEventListener('click', (e) => toggleHidden(parseInt(e.currentTarget.dataset.id))));
        adminGradeList.querySelectorAll('.btn-delete').forEach(btn =>
            btn.addEventListener('click', (e) => deleteGrade(parseInt(e.currentTarget.dataset.id))));
    }

    function toggleHidden(id) {
        const g = gradesData.grades.find(x => x.id === id);
        if (!g) return;
        g.hidden = !g.hidden;
        renderAdminList();
    }

    function deleteGrade(id) {
        if (!confirm("Supprimer définitivement ce grade ?\n(Pour le retirer temporairement du site, utilisez plutôt « Masquer ».)")) return;
        gradesData.grades = gradesData.grades.filter(x => x.id !== id);
        renderAdminList();
    }

    // ============================================================
    // ADMIN — Export du JSON
    // ============================================================
    if (btnExport) {
        btnExport.addEventListener('click', () => {
            // L'export passe désormais par la couche d'accès aux données (store.js).
            Store.saveCollection('grades', gradesData);
        });
    }
});

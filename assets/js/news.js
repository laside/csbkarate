document.addEventListener('DOMContentLoaded', () => {
    
    // Variables globales
    let newsData = [];
    
    // Elements du DOM - Mode Public
    const grid = document.getElementById('news-grid');
    
    // Elements du DOM - Mode Admin (login/modales gérés par admin.js)
    const adminNewsList = document.getElementById('admin-news-list');
    
    // Elements du Formulaire
    const formTitle = document.getElementById('form-title');
    const inputId = document.getElementById('news-id');
    const inputTitle = document.getElementById('news-title');
    const inputDate = document.getElementById('news-date');
    const inputCategory = document.getElementById('news-category');
    const inputImage = document.getElementById('news-image');
    const inputExcerpt = document.getElementById('news-excerpt');
    const btnSaveNews = document.getElementById('btn-save-news');
    const btnCancelEdit = document.getElementById('btn-cancel-edit');
    const btnExport = document.getElementById('btn-export');

    Store.loadCollection('news')
        .then(data => {
            newsData = data;
            renderPublicGrid();
        })
        .catch(error => {
            console.error(error);
            if(grid) grid.innerHTML = '<p class="text-gray-500 font-sans">Les actualités sont momentanément indisponibles.</p>';
        });

    function renderPublicGrid() {
        if (!grid) return;
        
        if (newsData.length === 0) {
            grid.innerHTML = '<p class="text-gray-500">Aucune actualité pour le moment.</p>';
            return;
        }

        grid.innerHTML = newsData.map((news, index) => {
            const borderColor = index % 2 === 0 ? 'border-t-csb-corail' : 'border-t-csb-dojo';
            
            // Gestion de l'image optionnelle
            let imageHTML = '';
            if (news.image && news.image.trim() !== '') {
                imageHTML = `
                    <div class="h-48 w-full mb-4 rounded-lg overflow-hidden bg-csb-tatami">
                        <img src="./assets/photos/${news.image}" alt="Illustration" class="w-full h-full object-cover group-hover:scale-105 transition duration-500" onerror="this.style.display='none'">
                    </div>
                `;
            }
            
            return `
                <article class="bento-card border-t-4 ${borderColor} flex flex-col group">
                    <div class="flex-grow">
                        ${imageHTML}
                        <time class="font-condensed text-sm text-gray-400 uppercase tracking-widest mb-3 block">${news.date}</time>
                        <span class="px-2 py-1 bg-csb-washi text-csb-dojo text-[10px] font-bold uppercase rounded mb-3 inline-block font-sans">${news.category}</span>
                        <h3 class="font-condensed text-2xl uppercase tracking-wider text-csb-encre mb-4 group-hover:text-csb-corail transition">${news.title}</h3>
                        <p class="text-gray-600 font-sans text-sm leading-relaxed mb-6">${news.excerpt}</p>
                    </div>
                </article>
            `;
        }).join('');
    }

    // Mode admin : connexion + dashboard (logique factorisée dans admin.js).
    Admin.init({
        onUnlock: renderAdminList,
        onCloseAdmin: renderPublicGrid
    });

    function renderAdminList() {
        adminNewsList.innerHTML = newsData.map(news => `
            <div class="bg-white p-4 rounded-xl border border-csb-tatami flex justify-between items-center gap-4">
                <div class="flex-grow">
                    <span class="text-xs text-gray-400 font-bold">${news.date} | ${news.category}</span>
                    <h4 class="font-bold text-csb-dojo">${news.title}</h4>
                </div>
                <div class="flex gap-2">
                    <button class="btn-edit px-3 py-1 bg-gray-100 text-gray-600 rounded hover:bg-csb-dojo hover:text-white transition text-sm" data-id="${news.id}">Éditer</button>
                    <button class="btn-delete px-3 py-1 bg-red-100 text-csb-corail rounded hover:bg-csb-corail hover:text-white transition text-sm" data-id="${news.id}">Supprimer</button>
                </div>
            </div>
        `).join('');

        // Ajout des événements sur les nouveaux boutons
        document.querySelectorAll('.btn-delete').forEach(btn => {
            btn.addEventListener('click', (e) => deleteNews(parseInt(e.target.dataset.id)));
        });
        document.querySelectorAll('.btn-edit').forEach(btn => {
            btn.addEventListener('click', (e) => loadNewsIntoForm(parseInt(e.target.dataset.id)));
        });
    }

    function deleteNews(id) {
        if(confirm("Supprimer cette actualité ?")) {
            newsData = newsData.filter(news => news.id !== id);
            renderAdminList();
        }
    }

    function loadNewsIntoForm(id) {
        const news = newsData.find(n => n.id === id);
        if(!news) return;

        formTitle.textContent = "Modifier l'Actu";
        formTitle.classList.replace('text-csb-corail', 'text-csb-dojo');
        
        inputId.value = news.id;
        inputTitle.value = news.title;
        inputDate.value = news.date;
        inputCategory.value = news.category;
        inputImage.value = news.image || '';
        inputExcerpt.value = news.excerpt;
        
        btnCancelEdit.classList.remove('hidden');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function resetForm() {
        formTitle.textContent = "Ajouter une Actu";
        formTitle.classList.replace('text-csb-dojo', 'text-csb-corail');
        
        inputId.value = '';
        inputTitle.value = '';
        inputDate.value = '';
        inputCategory.value = '';
        inputImage.value = '';
        inputExcerpt.value = '';
        
        btnCancelEdit.classList.add('hidden');
    }

    btnCancelEdit.addEventListener('click', resetForm);

    btnSaveNews.addEventListener('click', () => {
        // Validation basique
        if(!inputTitle.value || !inputDate.value || !inputCategory.value || !inputExcerpt.value) {
            alert("Veuillez remplir tous les champs obligatoires.");
            return;
        }

        const newsObj = {
            id: inputId.value ? parseInt(inputId.value) : Date.now(), // ID unique basique
            date: inputDate.value,
            category: inputCategory.value,
            title: inputTitle.value,
            excerpt: inputExcerpt.value,
            image: inputImage.value.trim()
        };

        if(inputId.value) {
            // Mode Mise à jour
            const index = newsData.findIndex(n => n.id === parseInt(inputId.value));
            if(index !== -1) newsData[index] = newsObj;
        } else {
            // Mode Ajout (On l'ajoute au tout début de la liste)
            newsData.unshift(newsObj);
        }

        resetForm();
        renderAdminList();
    });

    btnExport.addEventListener('click', () => {
        // L'export passe désormais par la couche d'accès aux données (store.js).
        Store.saveCollection('news', newsData);
    });
});

document.addEventListener('DOMContentLoaded', () => {
    
    // Récupération des données JSON
    fetch('./data/news.json')
        .then(response => {
            if (!response.ok) throw new Error("Erreur lors du chargement des actualités");
            return response.json();
        })
        .then(newsData => {
            // Uniquement pour la page news.html
            const grid = document.getElementById('news-grid');
            if (grid) {
                // On affiche toutes les actualités
                grid.innerHTML = newsData.map((news, index) => {
                    // Alternance des couleurs de bordure pour l'esthétique
                    const borderColor = index % 2 === 0 ? 'border-t-csb-corail' : 'border-t-csb-dojo';
                    
                    return `
                        <article class="bento-card border-t-4 ${borderColor} flex flex-col group">
                            <div class="flex-grow">
                                <time class="font-condensed text-sm text-gray-400 uppercase tracking-widest mb-3 block">${news.date}</time>
                                <span class="px-2 py-1 bg-csb-washi text-csb-dojo text-[10px] font-bold uppercase rounded mb-3 inline-block font-sans">${news.category}</span>
                                <h3 class="font-serif text-2xl font-bold text-csb-encre mb-4 group-hover:text-csb-corail transition">${news.title}</h3>
                                <p class="text-gray-600 font-sans text-sm leading-relaxed mb-6">${news.excerpt}</p>
                            </div>
                        </article>
                    `;
                }).join('');
            }
        })
        .catch(error => {
            console.error(error);
            const grid = document.getElementById('news-grid');
            if(grid) grid.innerHTML = '<p class="text-gray-500 font-sans">Les actualités sont momentanément indisponibles.</p>';
        });
});

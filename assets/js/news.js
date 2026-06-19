document.addEventListener('DOMContentLoaded', () => {
    
    // On va chercher le fichier JSON contenant les actualités
    fetch('./data/news.json')
        .then(response => {
            if (!response.ok) throw new Error("Erreur lors du chargement des actualités");
            return response.json();
        })
        .then(newsData => {
            
            const carousel = document.getElementById('news-carousel');
            if (carousel) {
                // On ne prend que les 3 premières actualités pour l'accueil
                const latestNews = newsData.slice(0, 3);
                
                carousel.innerHTML = latestNews.map(news => `
                    <div class="min-w-[300px] max-w-[300px] snap-center bento-card border-t-4 border-t-csb-corail flex flex-col justify-between">
                        <div class="flex justify-between items-start mb-4">
                            <span class="text-xs font-bold text-gray-400 font-sans">${news.date}</span>
                            <span class="px-2 py-1 bg-gray-100 text-gray-600 text-[10px] font-bold uppercase rounded font-sans">${news.category}</span>
                        </div>
                        <h3 class="font-condensed text-2xl uppercase tracking-wider text-csb-encre mb-3 line-clamp-2">${news.title}</h3>
                        <p class="text-sm text-gray-600 line-clamp-3 font-sans">${news.excerpt}</p>
                    </div>
                `).join('');
            }

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
                                <span class="px-2 py-1 bg-gray-100 text-gray-600 text-[10px] font-bold uppercase rounded mb-3 inline-block font-sans">${news.category}</span>
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
            const carousel = document.getElementById('news-carousel');
            if(carousel) carousel.innerHTML = '<p class="text-gray-500 font-sans">Les actualités sont momentanément indisponibles.</p>';
        });
});

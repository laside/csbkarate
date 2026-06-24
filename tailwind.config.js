// Config CLI (build CI) — miroir de assets/js/tailwind.js (config CDN utilisée en local).
// Toute modification de palette/police doit être répercutée dans les DEUX fichiers.
module.exports = {
    content: [
        './*.html',
        './components/*.html',
        './assets/js/**/*.js',
    ],
    theme: {
        extend: {
            fontFamily: {
                sans: ['Inter', 'sans-serif'],
                serif: ['"Cormorant Garamond"', 'serif'],
                condensed: ['"Barlow Condensed"', 'sans-serif'],
            },
            colors: {
                csb: {
                    washi: '#FAF9F6',
                    encre: '#0D1B2A',
                    dojo: '#1B263B',
                    corail: '#E63946',
                    tatami: '#E0E1DD'
                }
            }
        }
    }
}

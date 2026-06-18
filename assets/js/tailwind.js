// Configuration centralisée des couleurs et polices FFK pour Tailwind CSS
tailwind.config = {
    theme: {
        extend: {
            fontFamily: {
                sans: ['Montserrat', 'Arial', 'sans-serif'],
            },
            colors: {
                ffk: {
                    blue: '#1423A0',   // Bleu Classic FFK
                    red: '#DC2D5A',    // Rouge Lollipop FFK
                    gray: '#8C8C8C',   // Gris Cool FFK
                    black: '#000000'   // Noir
                }
            }
        }
    }
}

export default function Footer() {
  return (
    <footer style={footerStyle}>
      <p style={footerTextStyle}>
        ©Par 2026 JENNY - Corentin VANBREMEERSCH
      </p>
    </footer>
  );
}

const footerStyle = {
  backgroundColor: '#A6A6A6',
  height: '40px',
  width: '100%',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'flex-end', // ✅ Aligné en bas
  paddingBottom: '22.5px', // ✅ 25% de 90px = 22.5px (texte aux 3/4)
borderTop: '1px solid #000', // ✅ Ligne noire en haut du footer
};

const footerTextStyle = {
  color: '#000',
  margin: 0,
  textAlign: 'center',
};
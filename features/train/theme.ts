export type ThemeColors = {
  background: string;
  text: string;
  card: string;
  border: string;
  subText: string;
  lcdBg: string;
  lcdText: string;
  lcdSubText: string;
  lcdBorder: string;
  modalBg: string;
};

export const Colors: { light: ThemeColors; dark: ThemeColors } = {
  light: {
    background: '#f2f2f7',
    text: '#000',
    card: '#fff',
    border: '#e5e5ea',
    subText: '#8e8e93',
    lcdBg: '#fff',
    lcdText: '#000',
    lcdSubText: '#666',
    lcdBorder: '#d1d1d6',
    modalBg: '#fff',
  },
  dark: {
    background: '#000',
    text: '#fff',
    card: '#1c1c1e',
    border: '#3a3a3c',
    subText: '#8e8e93',
    lcdBg: '#121212',
    lcdText: '#fff',
    lcdSubText: '#aaa',
    lcdBorder: '#333',
    modalBg: '#1c1c1e',
  },
};

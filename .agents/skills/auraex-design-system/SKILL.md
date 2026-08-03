---
name: auraex-design-system
description: Sistema de design, paleta de cores, tipografia, componentes de interface, efeitos visuais (glassmorphism/sombras) e regras de layout responsivo baseados no design do AuraEX. Use esta skill ao criar, refatorar ou estilizar interfaces web modernas mantendo a estética visual premium do AuraEX.
---

# 🎨 AuraEX Design System — Guia de Estilo e Componentes

Este guia define a linguagem visual, os tokens de design (CSS Variables), a tipografia e os padrões de componentes de interface do **AuraEX**. Use esta skill para construir interfaces elegantes, modernas e de alto padrão visual.

---

## 🌟 Princípios de Design

1. **Sofisticação Energética:** Uso do laranja caloroso e vibrante (`#ff5a1f`) como cor primária sobre superfícies neutras de alta qualidade.
2. **Clareza Visual & Hierarquia:** Tipografia limpa baseada na fonte `Inter`, pesos bem definidos e espaçamentos simétricos.
3. **Superfícies Suaves & Elevação:** Bordas arredondadas (`radius: 16px`), sombras suaves e contornos em 1px solid para separação nítida.
4. **Design Vivo e Responsivo:** Microinterações suaves ao passar o mouse (`transition: .18s ease`), estados ativos destacados e navegação lateral elegante.

---

## 🎨 Tokens de Design (CSS Variables)

Adicione as variáveis abaixo no `:root` do seu CSS principal (`index.css` ou `styles.css`):

```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');

:root {
  /* Marca / Primárias */
  --primary: #ff5a1f;
  --primary-dark: #e64c13;
  --primary-soft: #fff0e9;
  --primary-faint: #fff8f4;

  /* Texto / Tinta */
  --ink: #2f3035;
  --ink-soft: #5f6067;
  --muted: #8b8c93;

  /* Bordas / Linhas */
  --line: #e7e7ea;
  --line-strong: #d8d8dc;

  /* Superfícies e Fundos */
  --bg-app: #f6f6f7;
  --surface: #ffffff;
  --surface-2: #f7f7f8;
  --surface-3: #f0f0f2;
  --sidebar: #fbfbfc;

  /* Estados de Sistema */
  --success: #1f9560;
  --success-soft: #eaf8f1;
  --warning: #b87513;
  --warning-soft: #fff5df;
  --danger: #c94040;
  --danger-soft: #fff0f0;
  --info: #3767b1;
  --info-soft: #eef4ff;

  /* Sombras & Arredondamento */
  --shadow-sm: 0 4px 16px rgba(38, 39, 43, 0.04);
  --shadow: 0 12px 36px rgba(38, 39, 43, 0.08);
  --shadow-lg: 0 20px 48px rgba(38, 39, 43, 0.12);
  --radius-sm: 10px;
  --radius: 16px;
  --radius-lg: 22px;
}
```

---

## 🔤 Tipografia e Hierarquia

- **Fonte Principal:** `'Inter'`, system-ui, -apple-system, sans-serif.
- **Cor do Corpo:** `var(--ink)` (`#2f3035`).
- **Suavização:** `-webkit-font-smoothing: antialiased;`.

```css
body {
  font-family: 'Inter', system-ui, sans-serif;
  color: var(--ink);
  background: var(--bg-app);
  font-weight: 400;
  line-height: 1.5;
}

h1, h2, h3, h4, h5, h6 {
  color: var(--ink);
  font-weight: 500;
  margin: 0;
}
```

---

## 🧩 Componentes de Interface

### 1. Botões (`.btn`)

```css
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 18px;
  border-radius: var(--radius-sm);
  font-size: 13.5px;
  font-weight: 500;
  border: 1px solid transparent;
  cursor: pointer;
  transition: all 0.18s ease;
}

/* Primário (Laranja AuraEX) */
.btn-primary {
  background: var(--primary);
  color: #ffffff;
  box-shadow: 0 4px 12px rgba(255, 90, 31, 0.25);
}
.btn-primary:hover {
  background: var(--primary-dark);
  box-shadow: 0 6px 16px rgba(255, 90, 31, 0.35);
  transform: translateY(-1px);
}

/* Secundário / Suave */
.btn-soft {
  background: var(--primary-soft);
  color: var(--primary);
  border-color: transparent;
}
.btn-soft:hover {
  background: #ffe3d5;
}

/* Outline / Contorno */
.btn-outline {
  background: var(--surface);
  border-color: var(--line-strong);
  color: var(--ink);
}
.btn-outline:hover {
  background: var(--surface-2);
  border-color: var(--ink-soft);
}
```

---

### 2. Cartões & Contêineres (`.card`)

```css
.card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: 24px;
  box-shadow: var(--shadow-sm);
  transition: box-shadow 0.2s ease, transform 0.2s ease;
}

.card:hover {
  box-shadow: var(--shadow);
}
```

---

### 3. Navegação Lateral (Sidebar)

```css
.sidebar {
  width: 264px;
  background: var(--sidebar);
  border-right: 1px solid var(--line);
  display: flex;
  flex-direction: column;
  height: 100vh;
  position: fixed;
}

.nav-item {
  width: 100%;
  padding: 10px 14px;
  border-radius: 12px;
  border: 0;
  background: transparent;
  color: var(--ink-soft);
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 13.5px;
  font-weight: 450;
  transition: 0.18s ease;
}

.nav-item:hover {
  background: var(--surface-3);
  color: var(--ink);
}

.nav-item.active {
  background: var(--primary-soft);
  color: var(--primary);
  font-weight: 500;
}
```

---

### 4. Crachás e Status (Chips & Badges)

```css
.badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 11.5px;
  font-weight: 500;
}

.badge-success { background: var(--success-soft); color: var(--success); }
.badge-warning { background: var(--warning-soft); color: var(--warning); }
.badge-danger { background: var(--danger-soft); color: var(--danger); }
.badge-info { background: var(--info-soft); color: var(--info); }
```

---

### 5. Campos de Formulário (`input`, `select`)

```css
.form-control {
  width: 100%;
  padding: 11px 14px;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--ink);
  font-size: 13.5px;
  outline: none;
  transition: border-color 0.18s ease, box-shadow 0.18s ease;
}

.form-control:focus {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px rgba(255, 90, 31, 0.15);
}
```

---

## 📐 Diretrizes de Layout e Estrutura

- **App Shell:** Layout com barra lateral fixa (`264px`) e área de conteúdo principal rolável com margem esquerda (`margin-left: 264px`).
- **Container Principal:** Largura máxima de `1400px` para dashboards e painéis de dados.
- **Grids Responsivos:** Use `grid-template-columns: repeat(auto-fit, minmax(280px, 1fr))` para cartões de métricas.

---

## 🎨 Exemplos de Uso

Ao criar uma nova página ou componente, siga a estrutura:
1. Inclua as variáveis CSS do `:root`.
2. Use `.card` para caixas de conteúdo.
3. Aplique `.btn-primary` para botões de ação principal (Call to Action).
4. Utilize as cores de estado (`--success-soft`, `--danger-soft`) para tabelas e relatórios.

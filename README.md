# Fodinha — controle de partidas

Aplicativo web para controlar partidas de Fodinha na mesa: ordem da mesa, palpites, vazas, letras F‑O‑D‑I‑N‑H‑A, eliminações, placar, histórico e estatísticas.

- **Site 100% estático.** HTML + CSS + JavaScript puro. Não tem servidor, banco de dados, login nem processo de build.
- **Funciona offline.** Depois de aberto uma vez, pode ser instalado no celular (PWA) e usado sem internet.
- **Os dados ficam no aparelho.** As partidas são salvas automaticamente no navegador (localStorage) e nada é enviado para a internet.

---

## Estrutura

```text
/
├── index.html            ← página única; contém o modelo das telas (<template id="app-template">)
├── manifest.json         ← dados do app instalável (nome, ícones, cores)
├── service-worker.js     ← cache para funcionar offline
├── .nojekyll             ← avisa o GitHub Pages para publicar os arquivos como estão
├── assets/
│   ├── css/app.css       ← estilos e os 5 temas
│   ├── js/runtime.js     ← mini motor de interface (sem dependências)
│   ├── js/storage.js     ← StorageService: salvar, carregar, backup, migração de dados
│   ├── js/app.js         ← regras do Fodinha e lógica das telas
│   ├── fonts/            ← fontes locais (Bricolage Grotesque e Figtree, licença SIL OFL 1.1)
│   └── icons/            ← ícones do app e favicon
└── README.md
```

Todos os caminhos são **relativos**. O app funciona tanto em `https://usuario.github.io/` quanto em `https://usuario.github.io/nome-do-repositorio/`, sem configuração.

---

## 1. Colocar o projeto no GitHub

**Pelo site (sem instalar nada):**

1. Entre em <https://github.com/new>, dê um nome ao repositório (por exemplo `fodinha`), deixe-o **Public** e clique em **Create repository**.
2. Na página do repositório vazio, clique em **uploading an existing file**.
3. Arraste **todo o conteúdo** desta pasta: `index.html`, `manifest.json`, `service-worker.js`, `.nojekyll`, `README.md` e a pasta `assets`.
   - O `.nojekyll` começa com ponto e pode estar oculto no seu computador. Ele é opcional; se não aparecer, siga sem ele.
4. Clique em **Commit changes**.

**Pelo terminal (com Git instalado):**

```bash
cd pasta-do-fodinha
git init
git add .
git commit -m "Fodinha"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/fodinha.git
git push -u origin main
```

## 2. Ativar o GitHub Pages

1. No repositório, abra **Settings → Pages**.
2. Em **Build and deployment → Source**, escolha **Deploy from a branch**.
3. Em **Branch**, escolha **`main`** e a pasta **`/ (root)`**. Clique em **Save**.
4. Em um ou dois minutos, o endereço aparece no topo da mesma página, no formato `https://SEU-USUARIO.github.io/fodinha/`.

> **Prefere publicar a partir de `/docs`?** Mova todos os arquivos do site para uma pasta `docs/` no repositório e, no passo 3, escolha a pasta `/docs`. Nada mais muda, porque os caminhos são relativos.

Não é preciso GitHub Actions: não existe etapa de build.

## 3. Fazer atualizações

1. Altere os arquivos e envie para a branch `main`, seja pelo site (**Add file → Upload files**, substituindo) ou com `git commit` + `git push`.
2. **Abra `service-worker.js` e aumente o número em `CACHE_VERSION`**, por exemplo de `fodinha-v1.0.0` para `fodinha-v1.0.1`. Assim os celulares que já instalaram o app baixam a versão nova.
3. O GitHub Pages publica sozinho em cerca de 1 minuto. Nos aparelhos, a versão nova aparece ao abrir o app pela segunda vez.

**As partidas dos usuários não se perdem nas atualizações.** Os dados têm um número de versão (`dataVersion`). Se um dia o formato mudar, aumente `DATA_VERSION` em `assets/js/storage.js` e escreva a conversão dentro da função `migrate()`.

## 4. Executar no computador

Não precisa instalar nada além de um servidor simples. Na pasta do projeto, rode um destes:

```bash
python3 -m http.server 8000      # depois abra http://localhost:8000
# ou
npx serve .                      # se tiver Node.js
```

Abrir o `index.html` com dois cliques também funciona para jogar. Nesse modo o funcionamento offline e a instalação como app ficam desligados, porque o navegador só os permite em `http://` ou `https://`.

## 5. Versão de produção

**Não existe build.** Os arquivos desta pasta já são a versão de produção: é só publicá-los. O mesmo vale para Netlify, Vercel e Cloudflare Pages. Nesses serviços, deixe o comando de build vazio e use a pasta raiz como pasta de publicação.

---

## Dados, backup e privacidade

| | Como funciona |
|---|---|
| **Armazenamento local** | Cada jogada é salva na hora, no navegador deste aparelho. Atualizar ou fechar a página não perde nada, e uma rodada lançada pela metade volta de onde parou. |
| **Sem sincronização** | O celular e o computador **não** compartilham partidas automaticamente. Chrome e Safari no mesmo aparelho também não. |
| **Backup** | Na tela inicial, **Backup e dados → Exportar partidas** baixa o arquivo `fodinha-backup.json`. Para levar as partidas a outro aparelho, use **Importar backup** lá. |
| **Importação segura** | Importar nunca apaga nem sobrescreve partidas. Partidas iguais são ignoradas. Uma partida com o mesmo identificador e conteúdo diferente entra como cópia, com "(backup)" no nome. |
| **Cuidado** | Limpar os dados do navegador ou usar aba anônima apaga as partidas. Exporte um backup de vez em quando. |
| **Privacidade** | Sem login, sem analytics, sem rastreamento e sem chamadas a servidores externos. |

## Para o futuro: online e login

O app só lê e grava dados por meio de `StorageService` (`assets/js/storage.js`), que oferece `listGames()`, `loadGame()`, `saveGame()`, `deleteGame()`, `exportBackup()` e `importBackup()`, além do rascunho da rodada em andamento. Para sincronizar com um servidor no futuro, basta trocar a implementação dessas funções por chamadas a uma API. As regras do jogo em `app.js` não precisam mudar.

## Créditos

As fontes Bricolage Grotesque e Figtree estão sob a SIL Open Font License 1.1. As licenças estão em `assets/fonts/`.

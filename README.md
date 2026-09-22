# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

## ACIFAC Gmail Notifications

Configure these variables in `ACIFAC_BACKEND/.env` using a Gmail App Password, never a normal Gmail password:

```env
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=465
EMAIL_SECURE=true
EMAIL_USER=your-gmail@example.com
EMAIL_APP_PASSWORD=your-16-character-app-password
EMAIL_FROM=your-gmail@example.com
FRONTEND_URL=http://localhost:5173
ACIFAC_TIME_ZONE=Asia/Manila
```

Run the backend migration from `ACIFAC_BACKEND`:

```bash
npm run migrate
```

Restart the backend after changing `.env`:

```bash
npm run dev
```

An authenticated administrator can verify delivery with `POST /api/admin/email-test` and a JSON body such as `{ "recipient": "admin@example.com" }`. Email delivery failures are logged in PostgreSQL and do not roll back successful account, loan, or payment changes.

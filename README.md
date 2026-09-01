# Groupeseb

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 22.1.6.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Vitest](https://vitest.dev/) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.

## Publicar cambios del catálogo

Las ediciones hechas en `/admin` viven en Supabase; el sitio público sirve un
JSON estático. Este comando cierra el circuito:

```
npm run publish:site
```

Exporta la base a `public/data/catalog.json`, baja de R2 las fotos subidas,
compila y despliega. En PowerShell no encadenes con `&&` a mano: no es un
separador válido en Windows PowerShell 5.1.

| Comando | Qué hace |
|---|---|
| `npm run publish:site` | export + build + deploy (lo habitual) |
| `npm run export` | sólo regenera `catalog.json` desde Supabase |
| `npm run deploy:site` | sólo compila y despliega |
| `npm run load` | carga `catalog.json` a Supabase (tras correr el pipeline) |

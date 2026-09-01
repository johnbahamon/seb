import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./pages/home-page').then((m) => m.HomePage),
    title: 'Despiece de repuestos · Groupe SEB',
  },
  {
    path: 'familia/:family',
    loadComponent: () => import('./pages/family-page').then((m) => m.FamilyPage),
    title: (route) => `${route.paramMap.get('family')} · Despiece de repuestos`,
  },
  {
    path: 'modelo/:id',
    loadComponent: () => import('./pages/model-detail-page').then((m) => m.ModelDetailPage),
    title: 'Modelo · Despiece de repuestos',
  },
  {
    path: 'repuesto/:code',
    loadComponent: () => import('./pages/part-detail-page').then((m) => m.PartDetailPage),
    title: (route) => `${route.paramMap.get('code')} · Repuesto`,
  },
  {
    path: 'buscar',
    loadComponent: () => import('./pages/search-page').then((m) => m.SearchPage),
    title: 'Buscar repuestos',
  },
  {
    path: 'cart',
    loadComponent: () => import('./pages/cart-page').then((m) => m.CartPage),
    title: 'Carrito · Despiece de repuestos',
  },
  {
    path: 'admin',
    loadComponent: () => import('./pages/admin-page').then((m) => m.AdminPage),
    title: 'Administración · Despiece de repuestos',
  },
  { path: '**', redirectTo: '' },
];

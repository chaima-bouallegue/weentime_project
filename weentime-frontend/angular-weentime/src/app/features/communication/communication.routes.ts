import { Routes } from '@angular/router';

export const communicationRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/communication-shell.page').then(m => m.CommunicationShellPage),
    children: [
      {
        path: '',
        loadComponent: () => import('./pages/channel.page').then(m => m.ChannelPage)
      },
      {
        path: 'channel/:channelId',
        loadComponent: () => import('./pages/channel.page').then(m => m.ChannelPage)
      },
      {
        path: 'dm/:userId',
        loadComponent: () => import('./pages/direct-message.page').then(m => m.DirectMessagePage)
      }
    ]
  }
];

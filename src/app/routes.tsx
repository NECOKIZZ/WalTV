import { createBrowserRouter } from 'react-router';
import { Feed } from './screens/Feed';
import { Post } from './screens/Post';
import { Explore } from './screens/Explore';
import { MyProfile } from './screens/MyProfile';
import { UserProfile } from './screens/UserProfile';
import { Notifications } from './screens/Notifications';
import { Onboarding } from './screens/Onboarding';
import { Layout } from './components/Layout';
import { Auth } from './screens/Auth';
import { ZkLoginCallback } from './screens/ZkLoginCallback';
import { WorkflowDetail } from './screens/WorkflowDetail';
import { PromptDetail } from './screens/PromptDetail';
import { Settings } from './screens/Settings';
import { Landing } from './screens/Landing';

export const router = createBrowserRouter([
  {
    path: '/',
    Component: Landing,
  },
  {
    Component: Layout,
    children: [
      { path: '/feed', Component: Feed },
      { path: '/post', Component: Post },
      { path: '/explore', Component: Explore },
      { path: '/profile', Component: MyProfile },
      { path: '/user/:handle', Component: UserProfile },
      { path: '/notifications', Component: Notifications },
      { path: '/settings', Component: Settings },
      { path: '/workflow/:workflowId', Component: WorkflowDetail },
      { path: '/prompt/:promptId', Component: PromptDetail },
    ],
  },
  {
    path: '/onboarding',
    Component: Onboarding,
  },
  {
    path: '/auth',
    Component: Auth,
  },
  {
    path: '/auth/zklogin-callback',
    Component: ZkLoginCallback,
  },
]);

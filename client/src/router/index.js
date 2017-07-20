import Vue from 'vue';
import Router from 'vue-router';
import NProgress from 'nprogress';

import Hello from '@/components/Hello';
import SignUp from '@/components/SignUp';
import Status from '@/components/Status';
import Problems from '@/components/Problems';
import Ranks from '@/components/Ranks';
import Login from '@/components/Login';
import Contests from '@/components/Contests';
import User from '@/components/User';
import Account from '@/components/Account';
import ForgotPassword from '@/components/ForgotPassword';
import Page404 from '@/components/Page404';
import store from '@/store';

Vue.use(Router);

const router = new Router({

  mode: 'history',
  routes: [
    {
      path: '/',
      name: 'Home',
      component: Hello,
      meta: { title: 'Home' }
    },
    {
      path: '/login',
      name: 'login',
      component: Login,
      meta: { title: 'Login' }
    },
    {
      path: '/signup',
      name: 'SignUp',
      component: SignUp,
      meta: { title: 'Sign Up' }
    },
    {
      path: '/problems',
      name: 'Problems',
      component: Problems,
      meta: { title: 'Problems' }
    },
    {
      path: '/account',
      component: User,
      children: [
        {
          path: '',
          name: 'user-account',
          component: Account,
          meta: { title: 'Account' }
        },
        {
          path: 'password/reset',
          name: 'user-forgot-password',
          component: ForgotPassword,
          meta: { title: 'Reset Password' }
        }
      ]
    },
    {
      path: '/status',
      name: 'Status',
      component: Status,
      meta: { title: 'Status' }
    },
    {
      path: '/ranks',
      name: 'Ranks',
      component: Ranks,
      meta: { title: 'Ranks' }
    },
    {
      path: '/contests',
      name: 'Contests',
      component: Contests
    },
    {
      path: '*',
      component: Page404,
      meta: { title: '404' }
    }
  ]
});


router.beforeEach((to, from, next) => {

  document.title = to.meta.title;
  NProgress.start();

  if( (to.name === 'login' || to.name === 'SingUp') && store.getters.isLoggedIn )
    router.replace({ path: '/' });

  // if( to.matched.some(record => record.meta.auth) && !store.getters.isLoggedIn )
  //   router.replace({ path: '/login' });

  next();
});


router.afterEach((to,from) => {
  NProgress.done();
  NProgress.remove();
});


export default router;
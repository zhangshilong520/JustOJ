import Vue from 'vue';
import Router from 'vue-router';

import authRole from '@/lib/authRole';

import Hello from '@/components/Hello';
import SignUp from '@/components/SignUp';
import Status from '@/components/Status';
import Ranks from '@/components/Ranks';
import Login from '@/components/Login';

import User from '@/components/user/User';
import Account from '@/components/user/Account';
import ForgotPassword from '@/components/user/ForgotPassword';
import VerifyAccount from '@/components/user/VerifyAccount';

import ContestRoute from '@/components/contest/ContestRoute';
import Contests from '@/components/contest/Contests';
import CreateContest from '@/components/contest/edit/CreateContest';

import ProblemsRoute from '@/components/problem/ProblemsRoute';
import ProblemContentRoute from '@/components/problem/ProblemContentRoute';
import ProblemList from '@/components/problem/ProblemList';
import CreateProblem from '@/components/problem/Create';
import ViewProblem from '@/components/problem/View';
import ViewTestCase from '@/components/problem/ViewTestCase';
import Submissions from '@/components/Submissions';
import EditProblemCases from '@/components/problem/Edit/TestCase';
import EditProblemLimits from '@/components/problem/Edit/Limits';

import Page404 from '@/components/Page404';
import Page403 from '@/components/Page403';
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
      path: '/submissions',
      name: 'Submissions',
      component: Submissions,
      meta: { title: 'Submissions' }
    },
    {
      path: '/problems',
      component: ProblemsRoute,
      children: [
        {
          path: '',
          name: 'ProblemList',
          component: ProblemList,
          meta: { title: 'Problem List' }
        },
        {
          path: 'create',
          name: 'CreateProblem',
          component: CreateProblem,
          meta: { title: 'Create Problem', auth: true }
        },
        {
          path: 'testcase/:pid/:caseId',
          name: 'ViewTestCase',
          component: ViewTestCase,
          meta: { title: 'Test Case | View' }
        },
        {
          path: ':pid',
          component: ProblemContentRoute,
          children: [
            {
              path: 'edit/testcase',
              name: 'EditProblemCases',
              component: EditProblemCases,
              meta: { title: 'Edit Problem | Test Cases' }
            },
            {
              path: 'edit/limits',
              name: 'EditProblemLimits',
              component: EditProblemLimits,
              meta: { title: 'Edit Problem | Set Limits' }
            },
            {
              path: ':slug',
              name: 'ViewProblem',
              component: ViewProblem,
              meta: { title: 'Problems | View' }
            }
          ]
        }
        // {
        //   path: 'edit/testcase/:pid/:slug',
        //   name: 'EditProblemCases',
        //   component: EditProblemCases,
        //   meta: { title: 'Edit Problem | Test Cases' }
        // }
      ]
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
        },
        {
          path: 'verify',
          name: 'VerifyAccount',
          component: VerifyAccount,
          meta: { title: 'Verify Account' }
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
      component: ContestRoute,
      children: [
        {
          path: '',
          name: 'Contests',
          component: Contests,
          meta: { title: 'Contests' }
        },
        {
          path: 'create',
          name: 'CreateContest',
          component: CreateContest,
          meta: { title: 'Contests | Create', auth: true, role: 'admin' }
        }
      ]
    },
    {
      path: '/404',
      name: '404',
      component: Page404,
      meta: { title: '404 | Not Found' }
    },
    {
      path: '/403',
      name: '403',
      component: Page403,
      meta: { title: '403 | Access Denied' }
    },
    {
      path: '*',
      name: 'Not Found',
      component: Page404,
      meta: { title: '404 | Not Found' }
    }
  ]
});


router.beforeEach((to, from, next) => {

  document.title = to.meta.title;
  progressbar.start();

  if( (to.name === 'login' || to.name === 'SingUp') && store.getters.isLoggedIn ){
    router.replace({ path: '/' });
    return next();
  }

  //checking if user loggedin and check role
  if (to.matched.some(record => record.meta.auth) && !store.getters.isLoggedIn ) {
    router.replace({
      path: '/login',
      query: {
        next: to.fullPath
      }
    });
    return next();
  }


  if( !to.matched.some(record => record.meta.role) ){
    return next();
  }

  authRole(to.meta.role)
    .then(response => {
      return next();
    })
    .catch(error => {
      router.replace({ path: '/403' });
      return next();
    });
});


router.afterEach((to,from) => {
  progressbar.done();
  progressbar.remove();
});


export default router;
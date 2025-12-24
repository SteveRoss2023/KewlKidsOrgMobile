/**
 * Navigation Service
 * Provides a way to navigate from anywhere in the app, including API interceptors
 */
class NavigationService {
  private router: any = null;

  /**
   * Set the router instance (should be called from a component that has access to useRouter)
   */
  setRouter(router: any) {
    this.router = router;
  }

  /**
   * Navigate to login page
   */
  navigateToLogin() {
    if (this.router) {
      this.router.replace('/(auth)/login');
    } else {
      console.warn('NavigationService: Router not set. Cannot navigate to login.');
    }
  }

  /**
   * Navigate to a specific route
   */
  navigate(route: string) {
    if (this.router) {
      this.router.replace(route);
    } else {
      console.warn('NavigationService: Router not set. Cannot navigate to:', route);
    }
  }
}

export default new NavigationService();



import { AsyncPipe, DOCUMENT } from '@angular/common';
import { Component, Inject, OnInit } from '@angular/core';
import { environment } from '@env/environment';
import { BehaviorSubject } from 'rxjs';
import { tap } from 'rxjs/operators';

import { FooterLogosFilterService } from '@app/layout/footer/footer-logos-filter.service';
import { ApiConfig } from '@app/services/api';
import { CmsService } from '@app/services/cms.service';
import { IHome } from '@app/services/models/cms/pages/home';
import { IWidget } from '@app/services/models/cms/widgets/widget';
import { IWidgetSvg } from '@app/services/models/cms/widgets/widget-svg';
import { RouterEndpoints } from '@app/services/models/routerEndpoints';
import { CmsBlock2Component } from '@app/shared/cms/cms-block2/cms-block2.component';
import { CmsLandingPageComponent } from '@app/shared/cms/cms-landing-page/cms-landing-page.component';
import packageJson from '../../../../package.json';

@Component({
  selector: 'app-footer',
  templateUrl: './footer.component.html',
  imports: [CmsLandingPageComponent, CmsBlock2Component, AsyncPipe],
  standalone: true,
})
export class FooterComponent implements OnInit {
  /**
   * Router endpoints
   */
  readonly routerEndpoints = RouterEndpoints;

  /**
   * Current version of app
   */
  currentVersion = packageJson.version;

  /**
   * Rdf documentation link
   * @type {string}
   */
  rdfDocumentationURL: string;
  /**
   * Widget subject for logos section and navigation section
   */
  cmsFooterLogoSection = new BehaviorSubject<IWidget[]>(null);
  cmsFooterNavigationPage = new BehaviorSubject<IWidget[]>(null);
  /**
   * Data from api for home data
   */
  private homeData: IHome;

  /**
   * @ignore
   */
  constructor(
    public cmsService: CmsService,
    @Inject(DOCUMENT) private document: Document,
    private footerLogosFilterService: FooterLogosFilterService,
  ) {}

  /**
   * Setups rdf documentation link
   */
  ngOnInit(): void {
    this.getRDFDocumentationURL();
    this.assignCmsSection();
  }

  /**
   * Setups rdf documentation link
   */
  private getRDFDocumentationURL(): void {
    let baseURL: string;
    if (!environment.production) {
      baseURL = '/api';
    } else {
      baseURL = this.document.location.protocol + '//api.' + this.document.location.hostname.replace('www.', '');
    }
    this.rdfDocumentationURL = baseURL + ApiConfig.apiVersion + ApiConfig.rdfDoc;
  }

  private assignCmsSection() {
    this.cmsService.getHomePageWidgets().subscribe((response: IHome) => {
      this.homeData = response;

      this.cmsFooterNavigationPage.next(this.homeData.footer_nav.blocks as IWidget[]);
      this.setFooterLogos();
    });
  }

  /**
   * Set footer images based on contrast
   */
  private setFooterLogos() {
    this.footerLogosFilterService
      .filter(this.homeData.footer_logos as IWidgetSvg[])
      .pipe(
        tap((footerLogos) => {
          this.cmsFooterLogoSection.next(footerLogos as IWidgetSvg[]);
        }),
      )
      .subscribe();
  }
}

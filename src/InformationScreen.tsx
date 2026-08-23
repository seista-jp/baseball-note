export type InformationPage = "safety" | "privacy" | "terms";

type InformationScreenProps = {
  page: InformationPage;
  onBack: () => void;
  onNavigate: (page: InformationPage) => void;
};

const officialUrl = "https://seista-jp.github.io/baseball-note/";
const officialXUrl = "https://x.com/Taka_BsblWorks";
const contactEmail = "taka.bsbl.works@gmail.com";
const contactMailUrl =
  "mailto:taka.bsbl.works@gmail.com?subject=Baseball%20Note%E3%81%AB%E3%81%A4%E3%81%84%E3%81%A6";

function PageHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <header className="information-page-header">
      <button className="information-back-button" type="button" onClick={onBack} autoFocus>
        ← 戻る
      </button>
      <span>Baseball Note</span>
      <h1>{title}</h1>
    </header>
  );
}

function SafetyPage({ onBack, onNavigate }: Omit<InformationScreenProps, "page">) {
  return (
    <article className="information-page">
      <PageHeader title="安全とデータについて" onBack={onBack} />

      <div className="information-intro">
        <p>
          Baseball Noteを安心して使うために、通信、記録の保存、外部サービスについて説明します。
        </p>
      </div>

      <section>
        <h2>公式ページから利用してください</h2>
        <p>
          このアプリは、必ず公式URLから開いてください。利用を始めるために、提供元の分からないアプリやインストールファイルをダウンロードする必要はありません。
        </p>
        <a className="information-link" href={officialUrl}>
          {officialUrl}
        </a>
      </section>

      <section>
        <h2>インターネット通信と記録の保存</h2>
        <p>
          アプリを開くときや更新するときは、画面を表示するためにインターネットを使います。書いた記録や写真を送るための通信ではありません。
        </p>
        <p>
          記録や写真は、使っている端末の中に保存されます。通常の利用では、アプリの運営者が内容を見ることはできません。
        </p>
      </section>

      <section>
        <h2>アカウントと広告</h2>
        <p>
          アカウント登録はありません。名前、メールアドレス、パスワードの入力も不要です。広告や、利用状況を調べるためにこのアプリ独自に追加したアクセス解析もありません。
        </p>
      </section>

      <section>
        <h2>端末の機能と写真</h2>
        <p>
          このアプリは、位置情報、連絡先、マイクを読み取る機能を使用しません。写真は、利用者が「画像」から自分で選んだものだけを記録に保存します。端末内のほかの写真を自動で見ることはありません。
        </p>
      </section>

      <section>
        <h2>外部AIへ送る場合</h2>
        <p>
          記録を「AI用にコピー」しただけでは、外部AIへ送信されません。コピーした内容をChatGPTなどへ貼り付けて送信すると、その内容は利用したAIサービスへ送られます。名前など、送信したくない情報が入っていないか確認してください。
        </p>
      </section>

      <section>
        <h2>記録を失わないために</h2>
        <p>
          ブラウザのデータを消したとき、端末が故障したとき、機種変更したときなどに、記録が消えることがあります。消えた記録をアプリの運営者が元に戻すことはできません。
        </p>
        <p>
          「データを保存」を押すと、記録のバックアップファイルが保存されます。バックアップファイルは、記録が消えたときや別の端末へ移すときに、記録を元に戻すためのファイルです。
        </p>
        <p>
          バックアップファイルには記録や写真が入っているため、必要がない限り他人へ渡さず、大切に保管してください。
        </p>
      </section>

      <section>
        <h2>公開に使用しているサービス</h2>
        <p>
          このアプリの公開には、GitHub Pagesを使用しています。ページを開いたとき、GitHubが安全管理のためにIPアドレス（インターネットへ接続した端末の情報）を記録することがあります。ただし、端末内に保存した野球の記録や写真は含まれません。
        </p>
      </section>

      <section>
        <h2>安全性と動作について</h2>
        <p>
          安全に利用できるように開発と更新を行っていますが、すべての端末で必ず動くこと、記録が絶対に消えないこと、安全上の問題がまったく起きないことまでは保証できません。大切な記録は、定期的にバックアップしてください。
        </p>
      </section>

      <section>
        <h2>運営者とお問い合わせ</h2>
        <dl className="information-contact-list">
          <div>
            <dt>アプリ名</dt>
            <dd>Baseball Note</dd>
          </div>
          <div>
            <dt>運営者</dt>
            <dd>Taka_BsblWorks</dd>
          </div>
          <div>
            <dt>公式X</dt>
            <dd>
              <a href={officialXUrl} target="_blank" rel="noreferrer">
                @Taka_BsblWorks
              </a>
            </dd>
          </div>
          <div>
            <dt>メール</dt>
            <dd>{contactEmail}</dd>
          </div>
        </dl>
        <p>
          不具合や不審な表示に気づいた場合は、メールでお知らせください。記録内容、写真、バックアップファイル、パスワードなどは送らないでください。
        </p>
        <a className="information-primary-link" href={contactMailUrl}>
          メールで問い合わせる
        </a>
      </section>

      <nav className="information-related-links" aria-label="関連する方針">
        <button type="button" onClick={() => onNavigate("privacy")}>
          プライバシーポリシー
          <span aria-hidden="true">→</span>
        </button>
        <button type="button" onClick={() => onNavigate("terms")}>
          利用規約
          <span aria-hidden="true">→</span>
        </button>
      </nav>
    </article>
  );
}

function PrivacyPage({ onBack }: Pick<InformationScreenProps, "onBack">) {
  return (
    <article className="information-page policy-page">
      <PageHeader title="プライバシーポリシー" onBack={onBack} />

      <section>
        <h2>1. 運営者と問い合わせ先</h2>
        <p>運営者：Taka_BsblWorks</p>
        <p>お問い合わせ：{contactEmail}</p>
      </section>

      <section>
        <h2>2. 取得する情報</h2>
        <p>このアプリは、端末内に保存された記録や写真を取得しません。</p>
        <p>
          メールでお問い合わせいただいた場合は、返信と問題確認のため、送信元のメールアドレスとお問い合わせ内容を受け取ります。
        </p>
        <p>
          また、公開に使用しているGitHub Pagesでは、安全管理のためIPアドレスなどのアクセス情報が記録されることがあります。
        </p>
      </section>

      <section>
        <h2>3. 利用目的</h2>
        <p>
          お問い合わせで受け取ったメールアドレスと内容は、返信、不具合の確認、安全上の問題への対応、アプリの改善のために使用します。広告の配信や営業には使用しません。
        </p>
      </section>

      <section>
        <h2>4. 第三者への提供</h2>
        <p>
          お問い合わせで受け取った情報は、本人の同意がある場合や、法令に基づいて対応が必要な場合を除き、第三者へ提供しません。
        </p>
      </section>

      <section>
        <h2>5. 利用している外部サービス</h2>
        <p>
          このアプリの公開にはGitHub Pages、お問い合わせの受信にはGmailを使用しています。アクセス情報やメールの内容は、それぞれのサービスのプライバシーポリシーに基づいて取り扱われます。
        </p>
        <ul>
          <li>
            <a
              href="https://docs.github.com/ja/site-policy/privacy-policies/github-general-privacy-statement"
              target="_blank"
              rel="noreferrer"
            >
              GitHubのプライバシーについて
            </a>
          </li>
          <li>
            <a href="https://policies.google.com/privacy?hl=ja" target="_blank" rel="noreferrer">
              Googleのプライバシーポリシー
            </a>
          </li>
        </ul>
      </section>

      <section>
        <h2>6. 問い合わせメールの保管期間</h2>
        <p>
          お問い合わせメールは、対応内容の確認や同じ問題の再発確認のため、原則として最後の対応から1年間保管し、その後削除します。ただし、安全上の問題への対応や法令上の必要がある場合は、必要な期間だけ保管することがあります。
        </p>
      </section>

      <section>
        <h2>7. 問い合わせ情報の確認・削除</h2>
        <p>
          ご自身が送ったお問い合わせ情報について、確認、訂正、削除を希望する場合は、問い合わせ先メールアドレスまでご連絡ください。ご本人からの連絡であることを確認したうえで、必要な範囲で対応します。
        </p>
      </section>

      <section>
        <h2>8. プライバシーポリシーの変更</h2>
        <p>
          アプリの機能、利用する外部サービス、法令などが変わった場合は、このプライバシーポリシーを変更することがあります。大切な変更は、アプリ内または公式Xでお知らせします。
        </p>
      </section>

      <footer className="information-policy-date">
        <p>制定日：2026年8月23日</p>
        <p>最終更新日：2026年8月23日</p>
      </footer>
    </article>
  );
}

function TermsPage({ onBack }: Pick<InformationScreenProps, "onBack">) {
  return (
    <article className="information-page policy-page">
      <PageHeader title="利用規約" onBack={onBack} />

      <section>
        <h2>1. この規約について</h2>
        <p>
          この利用規約は、Taka_BsblWorksが提供するWebアプリ「Baseball Note」の利用条件を定めるものです。
        </p>
        <p>
          このアプリを利用した場合、この規約とプライバシーポリシーの内容を確認し、同意したものとして扱います。
        </p>
      </section>

      <section>
        <h2>2. アプリの目的</h2>
        <p>
          Baseball Noteは、野球の練習や試合で感じたこと、気づいたこと、次に意識したいことなどを記録し、あとから振り返るための無料アプリです。
        </p>
        <p>このアプリは、専門的な指導、医療行為、診断などを行うものではありません。</p>
      </section>

      <section>
        <h2>3. 利用料金</h2>
        <p>このアプリは無料で利用できます。</p>
        <p>
          ただし、インターネット通信に必要な料金、利用する端末の費用、外部AIなど別のサービスを利用するための費用は、利用者の負担となります。
        </p>
      </section>

      <section>
        <h2>4. 記録の保存</h2>
        <p>
          記録や写真は、利用している端末のブラウザ内に保存されます。アプリの運営者が記録や写真を保存したり、内容を確認したりする機能はありません。
        </p>
        <p>
          ブラウザのデータ削除、端末の故障、機種変更、アプリやブラウザの不具合などにより、記録が消えることがあります。
        </p>
        <p>
          大切な記録は、定期的に「データを保存」を使ってバックアップしてください。消えた記録を運営者が元に戻すことはできません。
        </p>
      </section>

      <section>
        <h2>5. 未成年者の利用</h2>
        <p>
          18歳未満の方は、保護者と一緒にこの利用規約とプライバシーポリシーを確認し、保護者の同意を得て利用してください。
        </p>
      </section>

      <section>
        <h2>6. 写真や記録内容について</h2>
        <p>利用者は、自分が入力する文章や写真について責任を持つものとします。</p>
        <p>
          ほかの人が写っている写真、個人情報、著作物などを記録するときは、必要に応じて本人や権利を持つ人の許可を得てください。
        </p>
        <p>
          他人を傷つける内容、法律に違反する内容、権利を侵害する内容を保存・共有する目的では利用しないでください。
        </p>
      </section>

      <section>
        <h2>7. 禁止すること</h2>
        <p>次の行為は禁止します。</p>
        <ul>
          <li>法律に違反する行為</li>
          <li>他人の権利やプライバシーを侵害する行為</li>
          <li>アプリの動作や公開を故意に妨害する行為</li>
          <li>アプリの弱点を悪用する行為</li>
          <li>ウイルスなどの有害なプログラムを配布する行為</li>
          <li>運営者や公式アプリになりすます行為</li>
          <li>改変したアプリを公式版だと誤解させて公開する行為</li>
          <li>その他、運営者が不適切と判断する行為</li>
        </ul>
      </section>

      <section>
        <h2>8. 外部AIの利用</h2>
        <p>「AI用にコピー」を押しただけでは、記録は外部AIへ送信されません。</p>
        <p>
          コピーした内容をChatGPTなどの外部AIへ貼り付けて送信した場合、その内容は利用した外部サービスへ送られます。
        </p>
        <p>
          外部AIを利用するときは、送信する内容を自分で確認し、利用するサービスの規約とプライバシーポリシーに従ってください。
        </p>
        <p>AIの回答が正しいとは限りません。重要な判断は、AIの回答だけを根拠にしないでください。</p>
      </section>

      <section>
        <h2>9. 体調や痛みの記録</h2>
        <p>体調や痛みについての記録、振り返り、AIの回答は、医師による診断ではありません。</p>
        <p>
          強い痛み、長引く不調、けがの心配がある場合は、無理をせず、保護者、指導者、医療機関などへ相談してください。
        </p>
      </section>

      <section>
        <h2>10. アプリの変更・停止</h2>
        <p>
          運営者は、安全性の向上、不具合の修正、使いやすさの改善などのため、アプリの内容を変更することがあります。
        </p>
        <p>
          また、保守、安全上の問題、公開サービスの停止などにより、アプリの提供を一時的または継続的に停止することがあります。
        </p>
        <p>
          大きな変更や提供終了を行う場合は、可能な範囲でアプリ内または公式Xでお知らせします。
        </p>
      </section>

      <section>
        <h2>11. 安全性と動作の保証</h2>
        <p>運営者は、安全に利用できるように開発と更新を行います。</p>
        <p>
          ただし、すべての端末やブラウザで必ず動くこと、記録が絶対に消えないこと、不具合や安全上の問題がまったく起きないことまでは保証できません。
        </p>
        <p>
          問題が起きた場合は、内容を確認し、合理的に可能な範囲で対応します。運営者の責任は、適用される法令に従います。この規約は、法令上免除できない責任まで免除するものではありません。
        </p>
      </section>

      <section>
        <h2>12. 権利について</h2>
        <p>利用者が自分で記録した文章や写真の権利は、利用者または元の権利を持つ人にあります。</p>
        <p>
          このアプリのプログラム、画面デザイン、ロゴ、説明文などの権利は、運営者または正当な権利を持つ人にあります。
        </p>
      </section>

      <section>
        <h2>13. プライバシー</h2>
        <p>利用者の情報の取り扱いについては、別に掲載する「プライバシーポリシー」で説明します。</p>
      </section>

      <section>
        <h2>14. 規約の変更</h2>
        <p>
          アプリの機能、利用する外部サービス、法令などが変わった場合は、この利用規約を変更することがあります。
        </p>
        <p>大切な変更は、アプリ内または公式Xでお知らせします。</p>
      </section>

      <section>
        <h2>15. 準拠する法律</h2>
        <p>この規約には日本の法律を適用します。</p>
        <p>
          問題が起きた場合は、まず当事者間で話し合い、解決を目指します。裁判が必要になった場合は、日本の法令に従って管轄裁判所を決定します。
        </p>
      </section>

      <section>
        <h2>16. 運営者と問い合わせ先</h2>
        <ul>
          <li>アプリ名：Baseball Note</li>
          <li>運営者：Taka_BsblWorks</li>
          <li>
            公式X：
            <a href={officialXUrl} target="_blank" rel="noreferrer">
              @Taka_BsblWorks
            </a>
          </li>
          <li>メール：{contactEmail}</li>
          <li>
            公式URL：<a href={officialUrl}>{officialUrl}</a>
          </li>
        </ul>
        <p>記録内容、写真、バックアップファイル、パスワードなどは、問い合わせメールへ添付しないでください。</p>
      </section>

      <footer className="information-policy-date">
        <p>制定日：2026年8月23日</p>
        <p>最終更新日：2026年8月23日</p>
      </footer>
    </article>
  );
}

export function InformationScreen({ page, onBack, onNavigate }: InformationScreenProps) {
  if (page === "privacy") {
    return <PrivacyPage onBack={onBack} />;
  }

  if (page === "terms") {
    return <TermsPage onBack={onBack} />;
  }

  return <SafetyPage onBack={onBack} onNavigate={onNavigate} />;
}

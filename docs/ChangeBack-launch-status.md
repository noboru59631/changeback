# ChangeBack — 再開後の公開準備・GO/NO-GO

2026-10-19 JST。**Mainnet実行・応募送信はNO-GOを維持**。Studio反映と公開アプリのブロッカーは解消した。GitHub公開repo、Mainnet最終承認・実取引証拠、実動画は未完了。署名、送金、Mainnetデプロイ、応募送信は一切実行していない。

## URL

| 対象 | 確認結果 |
|---|---|
| Studio | https://studio.arc.io/app/8fb26e26-3f43-40dc-a940-85228dbbf710 |
| 公開アプリ | https://changeback-arc.crypto5555111.chatgpt.site |
| Mainnet表示 | https://changeback-arc.crypto5555111.chatgpt.site/?chainId=5042 |
| GitHub | 未作成・URL未確定。`noboru59631/changeback` は候補名であり、公開済みrepoとして扱わない |
| Builder profile | https://github.com/noboru59631 |
| 募集ページ | https://dorahacks.io/hackathon/arc-microgrants-2/detail |

## Studio反映と検証

- 初回ダウンロードの現行Studio版と前回レビュー版を比較。差分はアプリ9ファイル、387追加・46削除。3つの本番Solidityソースは変更なし。追加のローカル読み取りスクリプト `scripts/verify-payment.ts` はアプリ差分ではなく、Studioへの同期対象に含めなかった。
- Studio内ターミナルで元ファイルhashを事前確認し、前回の検証済みバイト列を同期。元版を退避。新規コード生成は行っていない。
- ターミナル変更直後のDownload Codeは旧保存版を返したため、その出力を反映済み証拠にしなかった。Studioへ1回だけ最小の読み取り指示を送り、9ファイルhashとテスト結果を確認して保存版を同期。その後のDownload Codeで全9ファイルが一致した。
- 再取得した保存版と公開配信用ソースは、`src`全体、本番3コントラクト、lockfile、package、型設定、Vite設定、Foundry設定等の計41ファイルでSHA-256一致。[全照合結果](ChangeBack-release-Studio-verification.json)、[9ファイルの前後hash](ChangeBack-Studio-sync-manifest.json)。
- Studio内の対象4ファイルで **134 pass / 0 fail / 198 assertions**。[ログ](Studio-tests-final.log)。前回の134件PASSを基準に、反映確認として同じ対象範囲のみ実行した。過去の83件Solidity試験とTestnet E2Eは再実行していない。
- Studio内のフロント型検査PASS、変更アプリ7ファイルのlintは0警告・0エラー、Vite本番ビルドPASS。[型検査](Studio-typecheck.log)、[lint](Studio-lint.log)、[ビルド](Studio-build.log)。既存の大きなchunk等のビルド警告は残る。
- 最初のテストはバックアップ内の旧テストも拾い、134 passに加えて1 errorとなった。退避コピーをアプリ外へ移した上で、明示ファイルパスによる最終実行は134/134 PASS。製品コードの不具合ではない。
- 既存デプロイ補助スクリプトの `@circlefin/compass-chains` 不足による全体型検査の問題は前回から未解消。フロント型検査と区別する。Studio管理のTestnetデプロイ経路をMainnetに流用しない。

## 公開アプリ

Sitesは配信だけに使用し、Studioで作成したアプリの実装を変更していない。公開配信用source commitは `bf4549b854af232d2b4522b37619f6dc1180a9ba`。このcommitはSites用ソース保管先の識別子であり、公開GitHub repoの代わりにはならない。

- 一般公開設定で配信成功。ログインもウォレット接続もなしに起動する。
- 公開JSとCSSのバイト列は検証済み配信用ビルドと一致。HTMLにはCloudflareの検知用scriptが追加されるため、生HTMLのhashは異なる。その追加部分以外のアプリHTMLは一致。[配信検証](ChangeBack-public-asset-verification.json)。Studio内とローカルのビルド生成物がバイト単位で同一とは主張しない。ソース41ファイルの一致を確認した。
- 公開アプリから既存Testnet Vault `0x6450E88EFeF6Bd1aA80529765834af153cfDf386` を読み取り、Closed、拠出0.10、支出0.03、返金0.07、未払債務0を確認。[画面](ChangeBack-public-testnet-read.png)、[読み取り記録](ChangeBack-public-testnet-read.txt)。新しいTestnet取引は送信していない。
- `?chainId=5042` でArc Mainnet表示、real funds警告、Mainnet Factory未登録による書き込み無効を確認。[画面](ChangeBack-public-mainnet-gate.png)、[記録](ChangeBack-public-mainnet-gate.txt)。これはMainnet取引E2Eの成功を意味しない。

## 現在の費用見積もりと上限

2026-10-19 08:11 JSTの読み取り更新。block `26678945`、chainId `5042`、USDC ERC-20 decimals `6`、base fee `20 gwei`。[RPC記録](mainnet-readonly.json)。署名前には再取得が必要。

| 項目 | 現在確認した値 | 承認候補上限 |
|---|---:|---:|
| Factory deployment gas | 2,631,442 gas | 3,200,000 gas |
| 20% buffer後gas | 3,157,731 gas | 同上 |
| Factory費用・base feeだけの参考計算 | 0.05262884 USDC | priority fee等を含む総額ではない |
| Factory費用・25 gweiでの参考計算 | 0.06578605 USDC | 実効単価・実gasにより変動 |
| Factory費用上限 | 実費ではない | 0.16000000 USDC |
| 14取引のgas合計 | **未見積もり**。未配備の後続取引は現在連続simulate不可 | **0.32947870 USDC** |
| 元本 | 0.10 USDC、Bへ0.03、Aへ0.07返金する案 | **0.10 USDC** |
| gas＋元本の総出金 | 実費ではない | **0.42947870 USDC** |

A残高 `3.263776842640538138` native USDC、nonce latest/pending `50/50`。B残高 `0.06`、nonce `0/0`。C残高0、今回は署名不要。残高は前回と同じ。nativeとERC-20は同一資金なので二重計上しない。Factory init-code hash `0x9da2fda32239d50fc18219850c2dd91ceaf8c985f10e7e126bba42550d4feac2`、runtime hash `0x44285755364ee21aa1338601d8fdf2dd50eaa6663cb2fc930af3a89f20954ebd`。既存Testnet Factory runtimeと同一。

Factory候補 `0xe5FB5C1081b951D47fCAAC554ebe3A095EEF25Fb`、Vault候補 `0x8073527729e7c9d1b4630C07f1E8ff48ad8640D0` は依然として予測値であり未配備。レシート確認前にMainnet許可リストへ追加しない。

具体的な14取引、署名者、各gas/fee上限、期限は [前回取引計画](ChangeBack-mainnet-review.md) を維持。配備後に各前提状態で再simulateし、上限超過・アカウント/ネットワーク/宛先/引数不一致時は停止。現在の上限候補を送信承認と解釈しない。

## 権限・回収リスク

- A `0x03607de69C487BcC460eaD7C4Bdfd25805658b75` はdeployer・唯一の今回拠出者・guardian・返金先。B `0x89A4EF745831CFe8957391Ad2e3CF55Dc3a6e502` は0.03支払先と第2承認者。C `0x0f6aD6BBEE5A68D864AE5252811Dd1CBA0Be83dC` は第3参加者。A/Bの2-of-3で実行する案。
- 閾値を満たす参加者は任意の許された宛先へ支払える。B自身が受取支出を承認するため、独立第三者による審査のデモではない。
- guardian pauseは一方向。返金はpause後24時間または元の支出期限の早い方から可能。返金・closeは自動実行ではなくgasを伴う取引が必要。
- `deposit`を通さないUSDC直接送金は会計外となり回収経路がない。USDC凍結で支出/返金が停止し得る。返金先固定で管理者救済・代替アドレスはない。少額でも損失可能性は残る。
- allowanceは確認済Vaultに100000単位だけ、native valueは全取引0、ネットワークは5042に限定する。

## GitHub・CLIの残ブロッカー

接続済みGitHub connectorで `noboru59631` を確認し、ChangeBack repo検索は空。ローカルGitHub CLIの既存tokenはinvalid。Arc Studio CLIは公式npm package `@circle-fin/arc-studio-cli@1.2.1` を作業フォルダーにのみ準備したが、`whoami`は未認証。認証情報や秘密鍵を収集・出力していない。

Studioの公式Connect via GitHubを選ぶ操作は、自動承認レビューが「Arc StudioにGitHub account/repositoriesへの新しいOAuth権限を与え得る」として拒否した。別経路による権限付与は行っていない。ユーザーは「自分で連携を完了する」を選択済み。StudioのConnect GitHub選択画面を開いて引き渡した。連携完了後、秘密情報を除外した公開repoへのpush、匿名での公開到達、Studio/配信版とのsource一致を確認する。

## 応募要件・最終承認までに必要なこと

公式募集ページをブラウザーで確認。本文は2026-11-01締切、画面timelineは2026/11/02 13:59表示で、時刻帯ラベルはない。確実性を優先し、ユーザー指定の11月1日までに準備・提出する。[取得記録](ChangeBack-grant-requirements-observed.txt)。要件はStudio製コントラクトとアプリ、Mainnet配備、アプリを通じた実USDC取引、公開repo、動画、Studio URL、builder profile。

1. ユーザーによるGitHub連携完了と公開repoの検証。
2. A/Bをユーザーが操作できること、作品提出権利・過去Arc/Circle助成との重複がないことを確認。
3. 14取引の早期返金経路か、10取引で自然RETURNを待つ経路かを確定。14取引はCollect約1時間後に継続可能、10取引は作成から約24時間待つ。
4. 上記chain/token/署名者/宛先/元本/個別fee上限/合計上限/artifact hash/回収リスクをまとめた最終票で、明示的な最終承認を受領。**現時点では承認依頼を送っていない。**
5. 承認後のみFactory配備。レシート・runtime一致確認後、実アドレスをStudioのMainnet許可リストへ反映し、同じソースをGitHub・公開アプリへ更新。後続取引は順次見積もり直す。
6. 公開アプリでMainnet実USDC移動、残高/債務/返金/closeのレシート検証、Studio buildと実取引を示す動画を作成して応募証拠を完成。

## 再開に使う成果物

- [修正済みソース](ChangeBack-source-reviewed.zip)：前回の検証済み・秘密情報除外済みアーカイブを再利用。現行Studioの9ファイルと一致する。公開GitHubの完成を意味しない。
- [応募文](ChangeBack-submission.md)：公開アプリURLとStudio照合結果を更新。Mainnet完了後用段落は条件付き草稿。
- [動画台本](ChangeBack-video-script.md)：実動画・Mainnet取引証拠の代わりにはならない。

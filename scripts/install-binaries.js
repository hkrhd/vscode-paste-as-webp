const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// プラットフォーム検出
function detectPlatform() {
    const platform = process.platform;
    const arch = process.arch;

    console.log(`プラットフォーム検出: ${platform}-${arch}`);

    switch (platform) {
        case 'win32':
            return 'win32';
        case 'darwin':
            return 'darwin';
        case 'linux':
            // WSL環境の検出
            if (process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP) {
                console.log('WSL環境を検出');
                return 'wsl';
            }
            return 'linux';
        default:
            throw new Error(`サポートされていないプラットフォーム: ${platform}`);
    }
}

// 依存関係のインストール
function installDependencies(platform) {
    console.log(`プラットフォーム ${platform} 向けの依存関係をインストール中...`);

    const dependencies = {
        'win32': [
            'sharp',
            '@napi-rs/clipboard'
        ],
        'darwin': [
            'sharp',
            '@napi-rs/clipboard'
        ],
        'linux': [
            'sharp',
            '@napi-rs/clipboard'
        ],
        'wsl': [
            'sharp',
            '@napi-rs/clipboard'
        ]
    };

    const platformDeps = dependencies[platform];
    if (!platformDeps) {
        throw new Error(`プラットフォーム ${platform} の依存関係が定義されていません`);
    }

    // 各依存関係を個別にインストール
    for (const dep of platformDeps) {
        try {
            console.log(`${dep} をインストール中...`);
            execSync(`npm install ${dep}`, { stdio: 'inherit' });
            console.log(`${dep} のインストールが完了しました`);
        } catch (error) {
            console.error(`${dep} のインストールに失敗しました:`, error.message);
            throw error;
        }
    }
}

// バイナリファイルの確認
function verifyBinaries() {
    console.log('バイナリファイルの存在確認中...');

    const requiredPaths = [
        'node_modules/sharp',
        'node_modules/@napi-rs/clipboard'
    ];

    const missingPaths = [];

    for (const p of requiredPaths) {
        if (!fs.existsSync(p)) {
            missingPaths.push(p);
        }
    }

    if (missingPaths.length > 0) {
        console.error('以下のパスが見つかりません:', missingPaths);
        return false;
    }

    // .nodeファイルの存在確認（再帰的に検索）
    const nodeFiles = [];
    const findNodeFiles = (dir) => {
        if (!fs.existsSync(dir)) return;

        try {
            const items = fs.readdirSync(dir);
            for (const item of items) {
                const fullPath = path.join(dir, item);
                try {
                    const stat = fs.statSync(fullPath);

                    if (stat.isDirectory()) {
                        findNodeFiles(fullPath);
                    } else if (item.endsWith('.node')) {
                        nodeFiles.push(fullPath);
                    }
                } catch (statError) {
                    // ファイルアクセスエラーは無視
                    continue;
                }
            }
        } catch (readError) {
            // ディレクトリ読み込みエラーは無視
            return;
        }
    };

    // node_modules全体を検索
    findNodeFiles('node_modules');

    console.log(`発見されたバイナリファイル: ${nodeFiles.length}個`);
    nodeFiles.forEach(file => console.log(`  - ${file}`));

    // 少なくとも1つのsharpと1つのclipboardバイナリが必要
    const hasSharp = nodeFiles.some(file => file.includes('sharp'));
    const hasClipboard = nodeFiles.some(file => file.includes('clipboard'));

    if (!hasSharp) {
        console.error('Sharp用のバイナリファイルが見つかりません');
        return false;
    }

    if (!hasClipboard) {
        console.error('Clipboard用のバイナリファイルが見つかりません');
        return false;
    }

    return nodeFiles.length > 0;
}

// メイン処理
async function main() {
    try {
        console.log('VSCode拡張機能のネイティブ依存関係インストールを開始...');

        const platform = detectPlatform();

        await installDependencies(platform);

        if (!verifyBinaries()) {
            throw new Error('バイナリファイルの検証に失敗しました');
        }

        console.log('✅ 全ての依存関係のインストールが完了しました');

    } catch (error) {
        console.error('❌ インストールに失敗しました:', error.message);
        process.exit(1);
    }
}

// 直接実行された場合のみメイン処理を実行
if (require.main === module) {
    main();
}

module.exports = { detectPlatform, installDependencies, verifyBinaries };

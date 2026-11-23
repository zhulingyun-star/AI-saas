import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Box, FileText, Plus, Inbox } from 'lucide-react';
import { useWorkspace } from '../../components/UI';
import { FolderGroup } from '../../gy/folders';
import { folderScope, needsReview, useLibrary, useRefreshLibrary } from './data';

/** 商品库左栏：文件夹（最多两层）、未分类、待核对。 */
export default function ProductSidebar() {
  const { client } = useWorkspace();
  const { folders, products } = useLibrary();
  const refresh = useRefreshLibrary();
  const [params] = useSearchParams();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const onList = pathname === '/products' || pathname === '/products/';
  const current = onList ? (params.get('folder') ?? 'all') : '';
  const count = (id: string) => {
    const scope = folderScope(folders, id);
    return products.filter((p) => p.folderId && scope.has(p.folderId)).length;
  };
  const unfiled = products.filter((p) => !p.folderId).length;
  const pending = products.filter(needsReview).length;
  const go = (folder: string) =>
    navigate(folder === 'all' ? '/products' : `/products?folder=${encodeURIComponent(folder)}`);

  return (
    <>
      <Link
        className="gy-side-new"
        to={
          current && current !== 'all' && current !== 'pending' && current !== 'unfiled'
            ? `/products/new?folder=${current}`
            : '/products/new'
        }
        title="新增商品"
      >
        <Plus size={16} aria-hidden="true" />
        <span className="lbl">新增商品</span>
      </Link>
      <nav className="gy-snav" aria-label="商品文件夹">
        <FolderGroup
          folders={folders}
          current={current}
          onSelect={go}
          all={{
            label: '全部商品',
            icon: <Box size={16} aria-hidden="true" />,
            count: products.length,
          }}
          count={count}
          unfiled={unfiled}
          endpoint={`/clients/${client.id}/product-folders`}
          onChanged={refresh}
        />
        <div className="g">待处理</div>
        <button
          type="button"
          className="gy-snav-item"
          aria-current={current === 'pending' ? 'true' : undefined}
          title="分析待核对"
          onClick={() => go('pending')}
        >
          {pending ? (
            <FileText size={16} aria-hidden="true" />
          ) : (
            <Inbox size={16} aria-hidden="true" />
          )}
          <span className="lbl">分析待核对</span>
          <span className="n">{pending}</span>
        </button>
      </nav>
      <div className="gy-side-foot">
        <b>{client.name}</b>
        {products.length} 个商品 · {folders.length} 个文件夹
      </div>
    </>
  );
}
